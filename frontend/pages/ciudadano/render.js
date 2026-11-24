/**
 * @file Renderizado del panel ciudadano.
 *
 * Pinta la lista de reportes, las estadísticas y el contador de
 * la descripción.
 *
 * @module frontend/pages/ciudadano/render
 */

function renderReportes() {
    const container = document.getElementById("listaReportes");
    const visibles = filtroActual === "all" ? reportes : reportes.filter((report) => report.estado === filtroActual);

    document.getElementById("reportesTitulo").textContent = filtroActual === "completado" ? "Historial de reportes" : "Mis reportes recientes";
    document.getElementById("reportesSubtitle").textContent = filtroActual === "completado"
        ? "Consulta los reportes que ya fueron completados."
        : "Consulta el estado de los reportes que has realizado.";
    document.getElementById("filtroActivo").textContent = filtroActual === "completado" ? "Completados" : "Todos";
    document.getElementById("filtroActivo").classList.toggle("is-history", filtroActual === "completado");

    if (!visibles.length) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon">${filtroActual === "completado" ? "🕘" : "📭"}</span>
                <strong>${filtroActual === "completado" ? "Todavía no hay reportes completados" : "No tienes reportes aún"}</strong>
                <p>${filtroActual === "completado" ? "Los reportes resueltos aparecerán aquí." : "Crea tu primer reporte y síguelo desde este panel."}</p>
                ${filtroActual === "completado"
                    ? `<button class="secondary compact-button" type="button" data-accion="restablecerFiltro">Ver todos los reportes</button>`
                    : `<button class="secondary compact-button" type="button" data-accion="abrirNuevoReporte">Crear mi primer reporte</button>`}
            </div>`;
    } else {
        container.innerHTML = visibles.map((reporte) => {
            const item = reporteSeguro(reporte);
            const image = features.reporteImagen(API, reporte, "report-thumb", iconoTipo(reporte.tipo));

            return `
                <article class="report-item">
                    <div class="report-left">
                        ${image}
                        <div class="report-info">
                            <strong>${item.tipo}</strong>
                            <span class="report-location">📍 ${item.localidad} · ${item.ubicacion} · ${fechaBonita(reporte.fecha)}</span>
                            <span class="report-description">${item.descripcion}</span>
                            <div class="actions">
                                <button class="action-button view-button" type="button" data-accion="verReporte" data-args='[${Number(reporte.id)}]'>Ver detalle</button>
                                ${reporte.latitud && reporte.longitud ? `<button class="action-button secondary-action" type="button" data-accion="abrirUbicacion" data-args='[${Number(reporte.id)}]'>Ver ubicación</button>` : ""}
                            </div>
                        </div>
                    </div>
                    <span class="status ${claseEstado(reporte.estado)}">${textoEstado(reporte.estado)}</span>
                </article>`;
        }).join("");
    }

    actualizarEstadisticas();
    actualizarBadgeNotificaciones(notificaciones);
}

/**
 * Actualiza los contadores de total, pendientes y en proceso.
 *
 * @returns {void}
 */
function actualizarEstadisticas() {
    document.getElementById("statTotal").textContent = reportes.length;
    document.getElementById("statPendientes").textContent = reportes.filter((report) => report.estado === "pendiente").length;
    document.getElementById("statProceso").textContent = reportes.filter((report) => report.estado === "en proceso").length;
}

/**
 * Muestra cuántos caracteres lleva la descripción del reporte.
 *
 * @returns {void}
 */
function actualizarContadorDescripcion() {
    const input = document.getElementById("nuevaDescripcion");
    const counter = document.getElementById("descripcionContador");
    if (input && counter) counter.textContent = `${input.value.length}/100`;
}
