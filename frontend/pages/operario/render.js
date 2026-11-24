/**
 * @file Renderizado del panel de operario.
 *
 * Pinta la lista de reportes y los contadores de trabajo.
 *
 * @module frontend/pages/operario/render
 */

function renderReportes() {
    const container = document.getElementById("listaReportes");
    const visibles = filtroActual === "all"
        ? reportes
        : filtroActual === "completado"
            ? reportes.filter((report) => report.estado === "completado")
            : reportes.filter((report) => report.estado !== "completado");

    document.getElementById("reportesTitulo").textContent = filtroActual === "completado" ? "Historial de trabajos" : filtroActual === "activos" ? "Reportes activos" : "Reportes asignados";
    document.getElementById("reportesSubtitle").textContent = filtroActual === "completado"
        ? "Consulta los reportes que ya fueron completados."
        : "Consulta, atiende y actualiza los reportes que tienes asignados.";
    document.getElementById("filtroActivo").textContent = filtroActual === "completado" ? "Completados" : filtroActual === "activos" ? "Activos" : "Todos";

    if (!visibles.length) {
        const message = filtroActual === "completado" ? "Todavía no has completado reportes." : "No tienes reportes activos asignados.";
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span><strong>${message}</strong><p>${filtroActual === "completado" ? "Los trabajos finalizados aparecerán en este historial." : "La empresa asignará nuevas tareas y aparecerán automáticamente."}</p>${filtroActual !== "all" ? `<button class="secondary compact-button" type="button" data-accion="restablecerFiltro">Ver todos</button>` : `<button class="secondary compact-button" type="button" data-accion="refrescarReportes">Actualizar ahora</button>`}</div>`;
    } else {
        container.innerHTML = visibles.map((report) => {
            const item = reporteSeguro(report);
            const image = features.reporteImagen(API, report, "report-thumb", "🗑️");

            /*
            Acción rápida según el estado actual. Además, el operario
            puede elegir cualquiera de los dos estados con "Cambiar estado",
            incluso regresando si se equivocó.
            */
            const stateAction = report.estado === "pendiente"
                ? `<button class="action-button process-button" type="button" data-accion="solicitarCambioEstado" data-args='[${Number(report.id)},"en proceso"]'>Iniciar atención</button>`
                : report.estado === "en proceso"
                    ? `<button class="action-button done-button" type="button" data-accion="solicitarCambioEstado" data-args='[${Number(report.id)},"completado"]'>Marcar resuelto</button>`
                    : `<button class="action-button process-button" type="button" data-accion="solicitarCambioEstado" data-args='[${Number(report.id)},"en proceso"]'>Reabrir reporte</button>`;

            const selectorEstado = `<button class="action-button state-button" type="button" data-accion="solicitarCambioEstado" data-args='[${Number(report.id)}]'>⇄ Cambiar estado</button>`;

            return `
                <article class="report-item">
                    <div class="report-left">
                        ${image}
                        <div class="report-info">
                            <strong>${item.tipo}</strong>
                            <span class="report-location">📍 ${item.localidad} · ${item.ubicacion} · ${fechaBonita(report.fecha)}</span>
                            <span class="report-description">${item.descripcion}</span>
                            <div class="actions">
                                <button class="action-button view-button" type="button" data-accion="verReporte" data-args='[${Number(report.id)}]'>Ver detalles</button>
                                ${report.latitud && report.longitud ? `<button class="action-button secondary-action" type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>Ubicación</button>` : ""}
                                ${stateAction}
                                ${selectorEstado}
                            </div>
                        </div>
                    </div>
                    <span class="status ${claseEstado(report.estado)}">${textoEstado(report.estado)}</span>
                </article>`;
        }).join("");
    }

    actualizarEstadisticas();
    actualizarBadgeNotificaciones(notificaciones);
}

/**
 * Actualiza contadores y el mensaje principal del panel.
 *
 * @returns {void}
 */
function actualizarEstadisticas() {
    const pendientes = reportes.filter((report) => report.estado === "pendiente").length;
    const enProceso = reportes.filter((report) => report.estado === "en proceso").length;
    document.getElementById("statAsignados").textContent = reportes.length;
    document.getElementById("statPendientes").textContent = pendientes;
    document.getElementById("statProceso").textContent = enProceso;
    document.getElementById("statResueltos").textContent = reportes.filter((report) => report.estado === "completado").length;
    document.getElementById("operatorHeroTitle").textContent = pendientes || enProceso ? "📍 Tienes reportes pendientes" : "✅ No tienes reportes pendientes";
    document.getElementById("operatorHeroText").textContent = pendientes || enProceso
        ? "Revisa los puntos asignados, atiende cada reporte y actualiza su estado cuando avances con el trabajo."
        : "Todo está al día. Los nuevos trabajos aparecerán automáticamente en este panel.";
}
