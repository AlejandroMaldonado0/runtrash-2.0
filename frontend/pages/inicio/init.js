/**
 * @file Arranque e interacciones globales de la página de inicio.
 *
 * Centraliza el cierre de modales con clic en el fondo o con la tecla
 * Escape. Se carga al final para que las funciones de registro y
 * recuperación ya existan.
 *
 * @module frontend/pages/inicio/init
 */

/**
 * Instala el cierre de los modales al pulsar el fondo oscuro y al
 * presionar Escape.
 *
 * @returns {void}
 */
function inicializarCierreModales() {
    /* Clic en el fondo oscuro cierra el modal correspondiente. */
    for (const [idModal, cerrar] of [
        ["modalRegistro", "cerrarRegistro"],
        ["modalRecuperacion", "cerrarRecuperacion"]
    ]) {
        document.getElementById(idModal).addEventListener("click", function (event) {
            if (event.target === this) window[cerrar]();
        });
    }

    /* Con la tecla Escape también se cierra. */
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;

        const registro = document.getElementById("modalRegistro");
        const recuperacion = document.getElementById("modalRecuperacion");

        if (recuperacion.classList.contains("active")) {
            cerrarRecuperacion();
        } else if (registro.classList.contains("active")) {
            cerrarRegistro();
        }
    });
}

document.addEventListener("DOMContentLoaded", function () {
    inicializarCierreModales();
    actualizarCamposRol();
    inicializarOAuth();
    completarIngresoOAuth();
});
