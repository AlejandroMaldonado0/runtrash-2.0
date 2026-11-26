/**
 * @file Renderizado del panel de empresa.
 *
 * Pinta la lista de reportes, los contadores y la analítica por
 * sector.
 *
 * @module frontend/pages/empresa/render
 */

/**
 * Pinta los reportes recibidos y el selector de asignación cuando
 * están pendientes.
 *
 * @returns {void}
 */
function renderReportes() {
    const container = document.getElementById("listaReportes");
    const visibles = filtroActual === "all"
        ? reportes
        : filtroActual === "sin_asignar"
            ? reportes.filter((report) => report.estado === "pendiente" && !report.operario_id)
            : reportes.filter((report) => report.estado === filtroActual);

    document.getElementById("reportesTitulo").textContent = filtroActual === "sin_asignar"
        ? "Reportes por asignar"
        : filtroActual === "completado" ? "Historial de reportes" : "Reportes recibidos";
    document.getElementById("reportesSubtitle").textContent = filtroActual === "sin_asignar"
        ? "Selecciona un operario y envíale el reporte para iniciar la atención."
        : filtroActual === "completado" ? "Consulta los trabajos finalizados por el equipo."
        : "Los reportes aparecen ordenados del más reciente al más antiguo.";
    document.getElementById("filtroActivo").textContent = filtroActual === "sin_asignar" ? "Sin asignar" : filtroActual === "completado" ? "Completados" : "Todos";

    if (!visibles.length) {
        const message = filtroActual === "sin_asignar"
            ? "No hay reportes pendientes de asignación."
            : filtroActual === "completado" ? "Todavía no hay reportes completados." : "No se han recibido reportes.";
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><strong>${message}</strong><p>Los cambios aparecerán automáticamente cuando el servidor envíe novedades.</p>${filtroActual !== "all" ? `<button class="secondary compact-button" type="button" data-accion="restablecerFiltro">Ver todos</button>` : ""}</div>`;
        return;
    }

    container.innerHTML = visibles.map((report) => {
        const item = reporteSeguro(report);
        const image = features.reporteImagen(API, report, "report-thumb", "🗑️");

        const assignment = report.estado === "pendiente" && !report.operario_id ? `
            <div class="assign-box">
                <div class="assign-select-wrap">
                    <label for="operario_${Number(report.id)}">Operario responsable</label>
                    <select id="operario_${Number(report.id)}">
                        <option value="">Selecciona un operario</option>
                        ${operarios.map((operator) => `<option value="${Number(operator.id)}">${features.escapeHTML(operator.nombre)}${operator.zona_asignada ? ` · ${features.escapeHTML(operator.zona_asignada)}` : operator.codigo_operario ? ` · ${features.escapeHTML(operator.codigo_operario)}` : ""}</option>`).join("")}
                    </select>
                </div>
                <button class="primary compact-button" id="assign_${Number(report.id)}" type="button" data-accion="enviarOperario" data-args='[${Number(report.id)}]'>📤 Asignar</button>
            </div>
            ${!operarios.length ? `<p class="inline-warning">No hay operarios registrados. Registra uno desde la cuenta de operario.</p>` : ""}
        ` : "";

        return `
            <article class="report-item company-report-item">
                <div class="report-top">
                    <div class="report-left">
                        ${image}
                        <div class="report-info">
                            <strong>${item.tipo}</strong>
                            <span class="report-location">📍 ${item.localidad} · ${item.ubicacion} · ${fechaBonita(report.fecha)}</span>
                            <span class="report-description">${item.descripcion}</span>
                            <div class="report-meta">👤 Ciudadano: ${item.ciudadano} · 👷 ${item.operario}</div>
                            <div class="actions">
                                <button class="action-button view-button" type="button" data-accion="verReporte" data-args='[${Number(report.id)}]'>Ver detalle</button>
                                ${report.latitud && report.longitud ? `<button class="action-button secondary-action" type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>Ver ubicación</button>` : ""}
                            </div>
                        </div>
                    </div>
                    <span class="status ${claseEstado(report.estado)}">${textoEstado(report.estado)}</span>
                </div>
                ${assignment}
            </article>`;
    }).join("");
}

/**
 * Pinta el equipo operativo con el estado de su código de verificación.
 *
 * @returns {void}
 */
function renderEquipo() {
    const container = document.getElementById("listaEquipo");
    const contador = document.getElementById("equipoContador");

    if (!container) return;

    if (contador) {
        contador.textContent = `${operarios.length} operario${operarios.length === 1 ? "" : "s"}`;
    }

    if (!operarios.length) {
        container.innerHTML = `<div class="empty-state compact-empty"><span class="empty-state-icon">👷</span><strong>Aún no hay operarios</strong><p>Un administrador puede crear operarios y asignarlos a tu empresa.</p></div>`;
        return;
    }

    container.innerHTML = operarios.map((operator) => {
        const nombre = features.escapeHTML(operator.nombre || "Operario");
        const inicial = nombre.charAt(0).toUpperCase();
        const zona = operator.zona_asignada
            ? features.escapeHTML(operator.zona_asignada)
            : "Sin zona asignada";
        const tieneCodigo = operator.tiene_codigo_verificacion === true;

        return `
            <article class="team-card">
                <div class="team-avatar" aria-hidden="true">${inicial}</div>
                <div class="team-info">
                    <strong>${nombre}</strong>
                    <small>${features.escapeHTML(operator.correo || "")}</small>
                    <div class="team-tags">
                        <span>📍 ${zona}</span>
                        <span>🔢 Código NIT: <b>${features.escapeHTML(operator.codigo_operario || "—")}</b></span>
                    </div>
                    <select
                        id="operarioZona_${Number(operator.id)}"
                        class="team-zona-select"
                        aria-label="Localidad asignada"
                    >
                        <option value="">Sin localidad asignada</option>
                        ${features.localidades.map((item) => `<option value="${item}"${String(operator.zona_asignada || "") === String(item) ? " selected" : ""}>${item}</option>`).join("")}
                    </select>
                    <button class="toolbar-button" type="button" data-accion="guardarLocalidadOperario" data-args='[${Number(operator.id)}]'>💾 Guardar localidad</button>
                </div>
                <div class="team-code">
                    <span class="team-code-status ${tieneCodigo ? "activo" : "pendiente"}">
                        ${tieneCodigo ? "✓ Código activo" : "Sin código · no puede ingresar"}
                    </span>
                    <button class="primary compact-button" type="button" data-accion="generarCodigoOperario" data-args='[${Number(operator.id)}]'>
                        ${tieneCodigo ? "🔄 Generar nuevo" : "🔐 Generar código"}
                    </button>
                </div>
            </article>`;
    }).join("");
}

/**
 * Actualiza los contadores del panel de empresa.
 *
 * @returns {void}
 */
function actualizarEstadisticas() {
    document.getElementById("statTotal").textContent = reportes.length;
    document.getElementById("statPendientes").textContent = reportes.filter((report) => report.estado === "pendiente" && !report.operario_id).length;
    document.getElementById("statProceso").textContent = reportes.filter((report) => report.estado === "en proceso").length;
    document.getElementById("statCompletados").textContent = reportes.filter((report) => report.estado === "completado").length;
}

/**
 * Pinta el análisis de reportes por sector de los últimos 15 días.
 *
 * @returns {void}
 */
function renderAnalytics() {
    const sectors = features.reportsBySector(reportes, 15);
    const recentTotal = sectors.reduce((total, sector) => total + sector.total, 0);
    const container = document.getElementById("analisisSectores");

    document.getElementById("analyticsTotal").textContent = recentTotal;
    document.getElementById("analyticsSectors").textContent = sectors.length;
    document.getElementById("analyticsTopSector").textContent = sectors[0]
        ? `${sectors[0].sector} · ${sectors[0].total}`
        : "—";

    if (!sectors.length) {
        container.innerHTML = `<div class="empty-state compact-empty"><span class="empty-state-icon">📊</span><strong>Sin datos en los últimos 15 días</strong><p>El análisis se actualizará cuando lleguen nuevos reportes.</p></div>`;
        return;
    }

    container.innerHTML = sectors.slice(0, 8).map((sector) => `
        <div class="sector-row">
            <div class="sector-heading"><strong>${features.escapeHTML(sector.sector)}</strong><span>${sector.total} reporte${sector.total === 1 ? "" : "s"}</span></div>
            <div class="sector-track"><span style="width:${sector.percentage}%"></span></div>
            <div class="sector-detail"><span>${sector.pendientes} pendiente${sector.pendientes === 1 ? "" : "s"}</span><span>${sector.completados} completado${sector.completados === 1 ? "" : "s"}</span></div>
        </div>`).join("");
}
