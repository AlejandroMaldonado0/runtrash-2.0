/**
 * @file Acciones del panel de empresa.
 *
 * Agrupa asignaciones, detalle de reportes, navegación externa,
 * exportaciones y desplazamientos por la interfaz.
 *
 * @module frontend/pages/empresa/acciones
 */

/**
 * Asigna en lote los reportes pendientes según localidad y carga.
 *
 * @returns {Promise<void>}
 */
/**
 * Actualiza la localidad asignada de un operario desde el panel.
 *
 * Permite cambiar o quitar la zona operativa sin crear la cuenta de
 * nuevo; los reportes se re-adjudican automaticamente por localidad.
 *
 * @param {HTMLElement} [elemento] - Selector de localidad.
 * @param {number} operarioId - Identificador del operario.
 * @returns {Promise<void>}
 */
async function actualizarLocalidadOperario(elemento, operarioId) {
    const zona = String(elemento?.value || "").trim() || null;
    const operario = operarios.find((item) => Number(item.id) === Number(operarioId));

    if (!operario) {
        return mostrarToast("Operario no encontrado.");
    }

    try {
        const respuesta = await features.apiFetch(`${API}/api/operarios/${Number(operarioId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ zona_asignada: zona })
        });
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.mensaje || "No se pudo actualizar la localidad.");
        }

        operario.zona_asignada = zona;
        await cargarDatos(true);
        mostrarToast("Localidad actualizada.");
        renderEquipo();
    } catch (error) {
        mostrarToast(error.message || "No se pudo actualizar la localidad.");
    }
}

async function asignarAutomaticamente() {
    const unassigned = reportes.filter((report) => report.estado === "pendiente" && !report.operario_id);
    const button = document.getElementById("autoAssignButton");

    if (!unassigned.length) {
        mostrarToast("No hay reportes pendientes de asignar.");
        return;
    }

    if (!operarios.length) {
        mostrarToast("Primero registra al menos un operario con localidad asignada.");
        return;
    }

    let assigned = 0;
    const failures = [];
    button.disabled = true;
    button.textContent = "Asignando...";

    try {
        /*
        Se recorre reporte por reporte para poder informar cuántos se
        asignaron y cuáles quedaron sin operario disponible.
        */
        for (const report of unassigned) {
            const response = await features.apiFetch(`${API}/api/reportes/${report.id}/asignar-automaticamente`, {
                method: "POST"
            });
            const data = await response.json();

            if (!response.ok) {
                failures.push(data.mensaje || `Reporte ${report.id}`);
            } else {
                assigned += 1;
            }
        }

        await cargarDatos(true);
        if (assigned) mostrarToast(`${assigned} reporte(s) asignado(s) por localidad y carga.`);
        if (failures.length) mostrarToast(`${failures.length} reporte(s) sin operario disponible: ${failures[0]}`);
    } catch (error) {
        mostrarToast(error.message || "No se pudo completar la asignación automática.");
    } finally {
        button.disabled = false;
        button.textContent = "⚡ Asignar automáticamente";
    }
}

/**
 * Asigna manualmente un reporte al operario elegido.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {Promise<void>}
 */
async function enviarOperario(id) {
    const select = document.getElementById(`operario_${id}`);
    const button = document.getElementById(`assign_${id}`);
    const operatorId = select?.value;

    if (!operatorId) {
        mostrarToast("Selecciona un operario responsable.");
        select?.focus();
        return;
    }

    button.disabled = true;
    button.textContent = "Asignando...";

    try {
        const response = await features.apiFetch(`${API}/api/reportes/${id}/asignar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operario_id: Number(operatorId) })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudo asignar el reporte.");

        await cargarDatos(true);
        mostrarToast("Reporte enviado al operario.");
    } catch (error) {
        mostrarToast(error.message || "No se pudo asignar el reporte.");
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = "📤 Asignar";
        }
    }
}

/**
 * Abre el detalle de un reporte recibido por la empresa.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function verReporte(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report) return;
    const item = reporteSeguro(report);

    document.getElementById("modalTitulo").textContent = "Detalle del reporte";
    document.getElementById("modalCard").classList.add("modal-card-wide");
    document.getElementById("modalContenido").innerHTML = `
        <div class="detail-hero"><div class="report-icon">🗑️</div><div><span class="status ${claseEstado(report.estado)}">${textoEstado(report.estado)}</span><h3>${item.tipo}</h3><p>${fechaBonita(report.fecha)}</p></div></div>
        ${features.reporteFotos(API, report, "detail-image", "🗑️")}
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">Localidad</span><div class="detail-value">📍 ${item.localidad}</div></div>
            <div class="detail-row"><span class="detail-label">Ubicación</span><div class="detail-value">🧭 ${item.ubicacion}</div></div>
            <div class="detail-row"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion}</div></div>
            <div class="detail-row"><span class="detail-label">Ciudadano</span><div class="detail-value">${item.ciudadano}</div></div>
            <div class="detail-row"><span class="detail-label">Operario</span><div class="detail-value">${item.operario}</div></div>
        </div>
        <div class="modal-actions">${report.latitud && report.longitud ? `<button class="primary" type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>🗺️ Google Maps</button><button class="secondary" type="button" data-accion="abrirWaze" data-args='[${Number(report.id)}]'>🚘 Waze</button>` : ""}<button class="secondary" type="button" data-accion="cerrarModal">Cerrar</button></div>`;
    document.getElementById("modal").classList.add("show");
}

/**
 * Abre el reporte en Google Maps si tiene coordenadas.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function abrirUbicacion(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report?.latitud || !report?.longitud) return mostrarToast("Este reporte no tiene coordenadas.");
    window.open(features.buildMapURL([report]), "_blank", "noopener");
}

/**
 * Abre la navegación en Waze hacia el reporte.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function abrirWaze(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report?.latitud || !report?.longitud) return mostrarToast("Este reporte no tiene coordenadas.");
    window.open(features.buildWazeURL(report), "_blank", "noopener");
}

/**
 * Devuelve los reportes que cumplen el filtro actual.
 *
 * @returns {Array<object>} Reportes visibles.
 */
function reportesVisibles() {
    return filtroActual === "all"
        ? reportes
        : filtroActual === "sin_asignar"
            ? reportes.filter((report) => report.estado === "pendiente" && !report.operario_id)
            : reportes.filter((report) => report.estado === filtroActual);
}

/**
 * Convierte los reportes visibles en filas para CSV o PDF.
 *
 * @returns {Array<Array<*>>} Filas listas para exportar.
 */
function localidadReporte(report) {
    const declarada = String(report.localidad || "").trim();
    if (declarada && declarada !== "Por geolocalizar") return declarada;

    const latitude = Number(report.latitud);
    if (latitude >= 4.68) return "Zona norte";
    if (latitude >= 4.62) return "Zona centro";
    return "Zona sur";
}

function localidadesCriticas() {
    const criticos = new Set();
    const grupos = new Map();
    reportesVisibles().forEach((report) => {
        const localidad = localidadReporte(report);
        if (!grupos.has(localidad)) grupos.set(localidad, { localidad, total: 0 });
        grupos.get(localidad).total += 1;
    });

    const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
    const total = lista.length;
    lista.forEach((group, index) => {
        const rank = total === 1
            ? "high"
            : total === 2
                ? (index === 0 ? "high" : "low")
                : index === 0 ? "high" : index === 1 ? "medium" : "low";
        if (rank === "high") criticos.add(group.localidad);
    });

    return criticos;
}

function datosExportacion() {
    const criticos = localidadesCriticas();
    return reportesVisibles().map((report) => [
        report.id,
        report.tipo,
        localidadReporte(report),
        report.ubicacion,
        report.descripcion,
        textoEstado(report.estado),
        report.operario || "Sin asignar",
        fechaBonita(report.fecha),
        report.ciudadano || "Sin información",
        report.empresa || "Sin empresa",
        (report.latitud && report.longitud)
            ? `${Number(report.latitud).toFixed(6)}, ${Number(report.longitud).toFixed(6)}`
            : "Sin coordenadas",
        criticos.has(localidadReporte(report)) ? "Sí" : "No"
    ]);
}

/**
 * Descarga los reportes visibles como CSV compatible con Excel.
 *
 * @returns {void}
 */
function exportarExcel() {
    const rows = datosExportacion();
    if (!rows.length) return mostrarToast("No hay reportes para exportar con el filtro actual.");
    features.downloadCSV(
        `runtrash-reportes-${new Date().toISOString().slice(0, 10)}.csv`,
        ["ID", "Tipo", "Localidad", "Ubicación", "Descripción", "Estado", "Operario", "Fecha", "Ciudadano", "Empresa", "Coordenadas", "Punto crítico"],
        rows
    );
    mostrarToast("Archivo CSV compatible con Excel descargado.");
}

/**
 * Genera una vista imprimible con el resumen de gestión.
 *
 * @returns {void}
 */
function exportarPDF() {
    const rows = datosExportacion();
    if (!rows.length) return mostrarToast("No hay reportes para exportar con el filtro actual.");
    try {
        const criticos = rows.filter((row) => row[11] === "Sí");
        const criticosPorLocalidad = new Map();
        criticos.forEach((row) => {
            const localidad = String(row[2] || "Sin localidad");
            criticosPorLocalidad.set(localidad, (criticosPorLocalidad.get(localidad) || 0) + 1);
        });
        const puntoCritico = [...criticosPorLocalidad.entries()].sort((a, b) => b[1] - a[1])[0];
        const resumen = [
            { label: "Total", value: rows.length },
            { label: "Pendientes", value: rows.filter((row) => row[5] === "Pendiente").length },
            { label: "En proceso", value: rows.filter((row) => row[5] === "En proceso").length },
            { label: "Completados", value: rows.filter((row) => row[5] === "Completado").length },
            { label: "Con asignación", value: rows.filter((row) => row[6] !== "Sin asignar").length },
            { label: "Sin asignación", value: rows.filter((row) => row[6] === "Sin asignar").length }
        ];

        if (criticos.length) resumen.push({ label: "Puntos críticos", value: criticos.length });
        if (puntoCritico) resumen.push({ label: `Punto crítico · ${puntoCritico[0]}`, value: `${puntoCritico[1]} reporte(s)` });

        const porLocalidad = new Map();
        rows.forEach((row) => {
            const localidad = String(row[2] || "Sin localidad");
            porLocalidad.set(localidad, (porLocalidad.get(localidad) || 0) + 1);
        });
        const graficaPorLocalidad = {
            title: "Reportes por localidad",
            data: [...porLocalidad.entries()]
                .map(([label, value]) => ({ label, value }))
                .sort((a, b) => b.value - a.value)
        };
        const graficaPorEstado = {
            title: "Reportes por estado",
            data: ["Pendiente", "En proceso", "Completado"]
                .map((estado) => ({
                    label: estado,
                    value: rows.filter((row) => row[5] === estado).length
                }))
                .filter((item) => item.value > 0)
        };

        return features.printPDF({
            title: "Reporte de gestión RunTrash",
            subtitle: `Filtro: ${document.getElementById("filtroActivo").textContent} · Generado el ${fechaBonita(new Date())}`,
            headers: ["ID", "Tipo", "Localidad", "Ubicación", "Descripción", "Estado", "Operario", "Fecha", "Ciudadano", "Empresa", "Coordenadas", "Punto crítico"],
            rows,
            summary: resumen,
            charts: [graficaPorLocalidad, graficaPorEstado]
        });
    } catch (error) {
        mostrarToast(error.message);
    }
}

/**
 * Vuelve al inicio y limpia el filtro de reportes.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @returns {void}
 */
function irAInicio(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    filtroActual = "all";
    renderReportes();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Aplica un filtro y desplaza la vista a la lista de reportes.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @param {'all'|'sin_asignar'|'completado'} filter - Filtro a aplicar.
 * @returns {void}
 */
function irAReportes(menuElement, filter) {
    if (menuElement) seleccionarMenu(menuElement);
    filtroActual = filter;
    renderReportes();
    document.getElementById("reportes").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Repinta la analítica y desplaza la vista a su sección.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @returns {void}
 */
function irAAnalitica(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    renderAnalytics();
    document.getElementById("analitica").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Quita el filtro y muestra todos los reportes.
 *
 * @returns {void}
 */
function restablecerFiltro() {
    filtroActual = "all";
    renderReportes();
}

/**
 * Cierra el modal de la empresa solo al pulsar el fondo.
 *
 * @param {MouseEvent} [event] - Evento de clic.
 * @returns {void}
 */
function cerrarModal(event) {
    if (!event || event.target === document.getElementById("modal")) document.getElementById("modal").classList.remove("show");
}
