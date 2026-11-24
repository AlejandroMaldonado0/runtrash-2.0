/**
 * @file Detalle y mapas del panel ciudadano.
 *
 * Muestra el detalle de un reporte y abre sus coordenadas en
 * Google Maps o Waze.
 *
 * @module frontend/pages/ciudadano/detalle
 */

function verReporte(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report) return;

    const item = reporteSeguro(report);
    document.getElementById("modalTitulo").textContent = "Detalle del reporte";
    document.getElementById("modalCard").classList.add("modal-card-wide");
    document.getElementById("modalContenido").innerHTML = `
        <div class="detail-hero">
            <div class="report-icon" aria-hidden="true">${iconoTipo(report.tipo)}</div>
            <div><span class="status ${claseEstado(report.estado)}">${textoEstado(report.estado)}</span><h3>${item.tipo}</h3><p>${fechaBonita(report.fecha)}</p></div>
        </div>
        ${report.imagen_url ? features.reporteImagen(API, report, "detail-image", iconoTipo(report.tipo)) : ""}
        ${report.imagen_operario_url ? features.reporteImagen(API, { ...report, imagen_url: report.imagen_operario_url }, "detail-image", iconoTipo(report.tipo)) : ""}
        <div class="detail-grid">
            <div class="detail-row"><span class="detail-label">Localidad</span><div class="detail-value">📍 ${item.localidad}</div></div>
            <div class="detail-row"><span class="detail-label">Ubicación</span><div class="detail-value">🧭 ${item.ubicacion}</div></div>
            <div class="detail-row"><span class="detail-label">Descripción</span><div class="detail-value">${item.descripcion}</div></div>
            <div class="detail-row"><span class="detail-label">Ciudadano</span><div class="detail-value">${item.ciudadano}</div></div>
        </div>
        <div class="modal-actions">
            ${report.latitud && report.longitud ? `<button class="primary" type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>🗺️ Google Maps</button><button class="secondary" type="button" data-accion="abrirWaze" data-args='[${Number(report.id)}]'>🚘 Waze</button>` : ""}
            <button class="secondary" type="button" data-accion="cerrarModal">Cerrar</button>
        </div>`;
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
    if (!report?.latitud || !report?.longitud) {
        mostrarToast("Este reporte no tiene coordenadas guardadas.");
        return;
    }
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
 * Abre un mapa embebido con los reportes que tienen coordenadas.
 *
 * @param {HTMLElement} [menuElement] - Enlace del menú que se marca activo.
 * @returns {void}
 */
function mostrarMapa(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    const locatedReports = reportes.filter((report) => report.latitud && report.longitud);

    if (!locatedReports.length) {
        mostrarToast("Aún no tienes reportes con coordenadas para mostrar en el mapa.");
        return;
    }

    document.getElementById("modalTitulo").textContent = "Mapa de mis reportes";
    document.getElementById("modalCard").classList.add("modal-card-map");
    document.getElementById("modalContenido").innerHTML = `
        <div class="map-frame"><iframe title="Mapa de reportes" loading="lazy" src="${features.mapEmbedURL(locatedReports)}"></iframe></div>
        <div class="map-summary"><strong>${locatedReports.length}</strong><span>reportes con ubicación disponible</span></div>
        <div class="map-report-list">${locatedReports.slice(0, 6).map((report) => `
            <button type="button" data-accion="abrirUbicacion" data-args='[${Number(report.id)}]'>
                <span>${features.escapeHTML(report.tipo)}</span><small>${features.escapeHTML(report.ubicacion)}</small>
            </button>`).join("")}</div>
        <button class="primary" type="button" data-accion="abrirMapaCompleto">Abrir mapa completo</button>`;
    document.getElementById("modal").classList.add("show");
}

/**
 * Abre en una pestaña nueva el mapa con todos los reportes ubicados.
 *
 * @returns {void}
 */
function abrirMapaCompleto() {
    const locatedReports = reportes.filter((report) => report.latitud && report.longitud);
    window.open(features.buildMapURL(locatedReports), "_blank", "noopener");
}
