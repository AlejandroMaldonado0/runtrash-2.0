/**
 * @file Utilidades del panel ciudadano.
 *
 * Comprobaciones de sesión y símbolos usados por la lista de
 * reportes.
 *
 * @module frontend/pages/ciudadano/utils
 */

/**
 * Comprueba que haya una sesión de ciudadano activa.
 *
 * @param {boolean} [mostrarMensaje=true] - Avisar al usuario si falta sesión.
 * @returns {boolean} `true` si hay usuario.
 */
function exigirUsuario(mostrarMensaje = true) {
    if (!usuarioActual?.id) {
        if (mostrarMensaje) mostrarToast("Inicia sesión para crear y consultar reportes.");
        return false;
    }
    return true;
}

/**
 * Devuelve el emoji que representa el tipo de residuo.
 *
 * @param {string} tipo - Texto del tipo de reporte.
 * @returns {string} Emoji correspondiente.
 */
function iconoTipo(tipo) {
    const valor = String(tipo || "").toLowerCase();
    if (valor.includes("zona verde")) return "🌳";
    if (valor.includes("vía")) return "♻️";
    return "🗑️";
}
