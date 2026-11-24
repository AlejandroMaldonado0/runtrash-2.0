/**
 * @file Detalle de reportes del panel administrador.
 *
 * Muestra el resumen de un reporte reciente.
 *
 * @module frontend/pages/admin/detalle
 */

/**
 * Abre el detalle resumido de un reporte reciente.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function verReporteAdmin(id) {
    const report = resumen.recientes?.find((item) => item.id === id);
    if (!report) return;
    document.getElementById("adminModalTitle").textContent = "Reporte del sistema";
    document.getElementById("adminModalContent").innerHTML = `<div class="detail-grid"><div class="detail-row"><span class="detail-label">Tipo</span><div class="detail-value">${features.escapeHTML(report.tipo)}</div></div><div class="detail-row"><span class="detail-label">Estado</span><div class="detail-value">${features.escapeHTML(report.estado)}</div></div><div class="detail-row"><span class="detail-label">Localidad</span><div class="detail-value">${features.escapeHTML(report.localidad || "Por geolocalizar")}</div></div><div class="detail-row"><span class="detail-label">Ciudadano</span><div class="detail-value">${features.escapeHTML(report.ciudadano)}</div></div></div><button class="admin-primary-button full-admin-button" type="button" data-accion="cerrarModal">Cerrar</button>`;
    document.getElementById("adminModal").classList.add("show");
}
