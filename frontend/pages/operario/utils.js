/**
 * @file Utilidades del panel de operario.
 *
 * Comprobaciones de sesión usadas antes de operar reportes.
 *
 * @module frontend/pages/operario/utils
 */

/**
 * Comprueba que haya una sesión de operario activa.
 *
 * @param {boolean} [mostrarMensaje=true] - Avisar al usuario si falta sesión.
 * @returns {boolean} `true` si hay usuario.
 */
function exigirUsuario(mostrarMensaje = true) {
    if (!usuarioActual?.id) {
        if (mostrarMensaje) mostrarToast("Inicia sesión como operario para gestionar tus reportes.");
        return false;
    }
    return true;
}
