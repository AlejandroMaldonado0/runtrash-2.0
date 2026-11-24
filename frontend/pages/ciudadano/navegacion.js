/**
 * @file Navegación del panel ciudadano.
 *
 * Desplaza la vista entre secciones, restablece filtros y cierra el
 * modal activo.
 *
 * @module frontend/pages/ciudadano/navegacion
 */

/**
 * Vuelve al inicio, limpia el filtro y marca el enlace del menú.
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
 * Filtra los reportes y desplaza la vista a la sección.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @param {'all'|'completado'} filter - Filtro a aplicar.
 * @returns {void}
 */
function irAReportes(menuElement, filter) {
    if (menuElement) seleccionarMenu(menuElement);
    filtroActual = filter;
    renderReportes();
    document.getElementById("reportes").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Quita el filtro de completados y vuelve a mostrar todos los reportes.
 *
 * @returns {void}
 */
function restablecerFiltro() {
    filtroActual = "all";
    renderReportes();
    document.querySelector('.menu a[data-accion="irAReportes"]')?.setAttribute("aria-current", "page");
}

/**
 * Cierra el modal del ciudadano y limpia la vista previa de la foto.
 *
 * @param {MouseEvent} [event] - Evento de clic.
 * @returns {void}
 */
function cerrarModal(event) {
    if (!event || event.target === document.getElementById("modal")) {
        document.getElementById("modal").classList.remove("show");
        limpiarFormularioReporte();
    }
}
