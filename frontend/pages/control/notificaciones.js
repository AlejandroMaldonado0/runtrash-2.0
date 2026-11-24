/**
 * @file Notificaciones del panel de control.
 *
 * Descarga, pinta y marca como leídas las notificaciones del ente.
 *
 * @module frontend/pages/control/notificaciones
 */

/**
 * Descarga las notificaciones usando el helper compartido.
 *
 * @returns {Promise<void>}
 */
async function cargarNotificacionesInterno() {
    const datos = await cargarNotificacionesCompartidas(API);
    if (datos) notificaciones = datos;
}

/**
 * Descarga las notificaciones sin duplicar peticiones simultáneas.
 *
 * @returns {Promise<void>}
 */
function cargarNotificaciones() {
    return Concurrencia.ejecutar(
        "control:notificaciones",
        () => cargarNotificacionesInterno()
    );
}

/**
 * Abre el modal con la lista de notificaciones y el botón para
 * marcarlas como leídas.
 *
 * @returns {Promise<void>}
 */
async function mostrarNotificaciones() {
    try {
        if (!notificaciones.notificaciones.length) {
            await cargarNotificaciones();
            if (!notificaciones.notificaciones.length) {
                mostrarToast("No tienes notificaciones.");
                return;
            }
        }
        document.getElementById("controlModalTitle").textContent = "Notificaciones";
        document.getElementById("controlModalContent").innerHTML = notificaciones.notificaciones.map((item) => `
            <div class="control-history-item">
                <strong>${features.escapeHTML(item.titulo)}</strong>
                <p>${features.escapeHTML(item.mensaje || "")}</p>
                <small>${features.relativeTime(item.fecha)}</small>
            </div>
        `).join("") + `<button class="admin-primary-button full-admin-button" type="button" data-accion="marcarLeidas">Marcar como leídas</button>`;
        document.getElementById("controlModal").classList.add("show");
    } catch (error) {
        mostrarToast(error.message);
    }
}

/**
 * Marca todas las notificaciones como leídas y refresca el contador.
 *
 * @returns {Promise<void>}
 */
async function marcarLeidas() {
    try {
        await features.marcarNotificacionesLeidas(API);
        notificaciones.noLeidas = 0;
        actualizarBadgeNotificaciones(notificaciones);
        cerrarModal();
        mostrarToast("Notificaciones marcadas como leídas.");
    } catch (error) {
        mostrarToast(error.message);
    }
}
