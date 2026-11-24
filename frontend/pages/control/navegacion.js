/**
 * @file Navegación del panel de control.
 *
 * Cierra el modal activo y desplaza la vista entre secciones.
 *
 * @module frontend/pages/control/navegacion
 */

/**
 * Cierra el modal de control y olvida el reporte abierto.
 * Solo reacciona al clic del fondo, no al de su contenido.
 *
 * @param {MouseEvent} [event] - Evento de clic.
 * @returns {void}
 */
function cerrarModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById("controlModal")?.classList.remove("show");
    reporteAbierto = null;
}

/**
 * Marca el enlace activo del menú y desplaza la vista a la sección.
 *
 * @param {HTMLElement|null} link - Enlace pulsado.
 * @param {string} selector - Selector de la sección destino.
 * @returns {void}
 */
function irA(link, selector) {
    document.querySelectorAll(".menu a").forEach((item) => item.classList.remove("active"));
    link?.classList.add("active");
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
