/**
 * @file Navegación del panel administrador.
 *
 * Desplaza la vista entre secciones, refresca el panel y cierra el
 * modal activo.
 *
 * @module frontend/pages/admin/navegacion
 */

/**
 * Marca el enlace activo del menú y desplaza la vista a la sección.
 *
 * @param {HTMLElement} element - Enlace pulsado.
 * @param {string} selector - Selector de la sección destino.
 * @returns {void}
 */
function irA(element, selector) {
    document.querySelectorAll(".menu a").forEach((item) => { item.classList.remove("active"); item.removeAttribute("aria-current"); });
    element.classList.add("active"); element.setAttribute("aria-current", "page");
    document.querySelector(selector).scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Recarga los datos del panel a petición del usuario.
 *
 * @returns {Promise<void>}
 */
async function refrescarTodo() {
    await cargarTodo();
    mostrarToast("Panel actualizado.");
}

/**
 * Cierra el modal administrativo. Solo actúa sobre el fondo para no
 * cerrarlo al hacer clic en su contenido.
 *
 * @param {MouseEvent} [event] - Evento de clic.
 * @returns {void}
 */
function cerrarModal(event) {
    if (!event || event.target === document.getElementById("adminModal")) document.getElementById("adminModal").classList.remove("show");
}
