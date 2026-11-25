/**
 * @file Navegación del panel de operario.
 *
 * Desplaza la vista entre secciones, refresca reportes y cierra los
 * modales.
 *
 * @module frontend/pages/operario/navegacion
 */

/**
 * Recarga los reportes y desplaza la vista a la lista.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @returns {void}
 */
function refrescarReportes(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    document.getElementById("reportes").scrollIntoView({ behavior: "smooth", block: "start" });
    cargarReportes().then(() => mostrarToast("Reportes actualizados."));
}

/**
 * Vuelve al inicio y limpia el filtro.
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
 * @param {'all'|'activos'|'completado'} filter - Filtro a aplicar.
 * @returns {void}
 */
function irAReportes(menuElement, filter) {
    if (menuElement) seleccionarMenu(menuElement);
    filtroActual = filter;
    renderReportes();
    document.getElementById("reportes").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Vuelve a mostrar todos los reportes.
 *
 * @returns {void}
 */
function restablecerFiltro() {
    filtroActual = "all";
    renderReportes();
}

/**
 * Cierra el modal de detalles del operario.
 *
 * @returns {void}
 */
function cerrarDetalles() {
    limpiarPreviewFotoOperario();
    document.getElementById("modalDetalles").classList.remove("show");
}

/**
 * Cierra el modal solo cuando el clic ocurre en el fondo.
 *
 * @param {MouseEvent} event - Evento de clic.
 * @returns {void}
 */
function cerrarModal(event) {
    if (event.target.id === "modalDetalles") cerrarDetalles();
}
