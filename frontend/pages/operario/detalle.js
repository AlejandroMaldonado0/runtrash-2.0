/**
 * @file Detalle del panel de operario.
 *
 * Muestra el detalle de un reporte asignado.
 *
 * @module frontend/pages/operario/detalle
 */

/**
 * Abre el detalle de un reporte asignado.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function verReporte(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report) return;
    const item = reporteSeguro(report);

    document.getElementById("tituloDetalle").textContent = "Detalle del reporte";
    document.getElementById("modalCard").classList.add("modal-card-wide");
    document.getElementById("detalleContenido").innerHTML = `
        <div class="detail-hero"><div class="report-icon">🗑️</div><div><span class="status ${claseEstado(report.estado)}">${textoEstado(report.estado)}</span><h3>${item.tipo}</h3><p>${fechaBonita(report.fecha)}</p></div></div>
        <div class="detail-fotos">
            ${report.imagen_url ? features.reporteImagen(API, report, "detail-image", "🗑️") : ""}
            ${report.imagen_operario_url ? features.reporteImagen(API, { ...report, imagen_url: report.imagen_operario_url }, "detail-image", "🗑️") : ""}
        </div>
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">Localidad</span><div class="detail-value">📍 ${item.localidad}</div></div>
            <div class="detail-row"><span class="detail-label">Ubicación</span><div class="detail-value">🧭 ${item.ubicacion}</div></div>
            <div class="detail-row"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion}</div></div>
            <div class="detail-row"><span class="detail-label">Ciudadano</span><div class="detail-value">${item.ciudadano}</div></div>
        </div>
        <div class="modal-actions">
            ${report.latitud && report.longitud ? `<button class="primary" type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>🗺️ Google Maps</button><button class="secondary" type="button" data-accion="abrirWaze" data-args='[${Number(report.id)}]'>🚘 Waze</button>` : ""}
            <button class="secondary" type="button" data-accion="solicitarCambioEstado" data-args='[${Number(report.id)}]'>⇄ Cambiar estado</button>
            <button class="secondary" type="button" data-accion="cerrarDetalles">Cerrar</button>
        </div>`;
    document.getElementById("modalDetalles").classList.add("show");
}
