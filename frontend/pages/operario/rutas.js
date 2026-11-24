/**
 * @file Rutas del panel de operario.
 *
 * Calcula la ruta optimizada y abre las paradas en Google Maps o
 * Waze.
 *
 * @module frontend/pages/operario/rutas
 */

/**
 * Calcula la ruta óptima con los reportes activos que tienen coordenadas.
 *
 * @returns {{active: Array<object>, optimized: Array<object>, distance: number}} Ruta y distancia.
 */
function rutaOperativa() {
    const active = reportes.filter((report) => report.estado !== "completado" && report.latitud && report.longitud);
    const optimized = features.optimizeRoute(active, Number(configuracion.limite_ruta || 15));
    return {
        active,
        optimized,
        distance: features.routeDistance(optimized)
    };
}

/**
 * Abre el modal con el mapa y las paradas de la ruta optimizada.
 *
 * @param {HTMLElement} [menuElement] - Enlace del menú que se marca activo.
 * @returns {void}
 */
function mostrarRuta(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    if (!exigirUsuario()) return;
    /* Los límites y el máximo de paradas los define el administrador. */
    const route = rutaOperativa();

    if (!route.optimized.length) {
        mostrarToast("No hay reportes activos con coordenadas para generar una ruta.");
        return;
    }

    document.getElementById("tituloDetalle").textContent = "Ruta optimizada";
    document.getElementById("modalCard").classList.add("modal-card-map");
    document.getElementById("detalleContenido").innerHTML = `
        <div class="map-frame"><iframe title="Mapa de ruta operativa" loading="lazy" src="${features.mapEmbedURL(route.optimized)}"></iframe></div>
        <div class="route-summary">
            <div><span>Puntos</span><strong>${route.optimized.length}</strong></div>
            <div><span>Distancia estimada</span><strong>${route.distance.toFixed(1)} km</strong></div>
        </div>
        ${route.active.length > Number(configuracion.limite_ruta || 15) ? `<div class="inline-warning">La ruta incluye los primeros ${Number(configuracion.limite_ruta || 15)} puntos, según la configuración del administrador. Quedan ${route.active.length - Number(configuracion.limite_ruta || 15)} reporte(s) para una segunda ruta.</div>` : ""}
        <div class="route-stops">${route.optimized.map((report, index) => `
            <div class="route-stop"><span>${index + 1}</span><div><strong>${features.escapeHTML(report.tipo)}</strong><p>${features.escapeHTML(report.ubicacion)}</p></div></div>`).join("")}</div>
        <div class="modal-actions"><button class="primary" type="button" data-accion="abrirRutaGoogle">Abrir ruta completa</button><button class="secondary" type="button" data-accion="abrirWazePrimeraParada">🚘 Waze: primera parada</button></div>`;
    document.getElementById("modalDetalles").classList.add("show");
}

/**
 * Abre la ruta completa en Google Maps.
 *
 * @returns {void}
 */
function abrirRutaGoogle() {
    const route = rutaOperativa();
    if (!route.optimized.length) return mostrarToast("La ruta ya no tiene puntos disponibles.");
    window.open(features.buildDirectionsURL(route.optimized), "_blank", "noopener");
}

/**
 * Abre en Waze la primera parada de la ruta.
 *
 * @returns {void}
 */
function abrirWazePrimeraParada() {
    const route = rutaOperativa();
    if (!route.optimized.length) return mostrarToast("No hay una primera parada disponible.");
    window.open(features.buildWazeURL(route.optimized[0]), "_blank", "noopener");
}

/**
 * Abre el reporte en Google Maps si tiene coordenadas.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {void}
 */
function abrirUbicacion(id) {
    const report = reportes.find((item) => item.id === id);
    if (!report?.latitud || !report?.longitud) return mostrarToast("Este reporte no tiene coordenadas guardadas.");
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
