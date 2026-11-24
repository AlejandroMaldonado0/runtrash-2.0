/**
 * @file Notificaciones del panel administrador.
 *
 * Abre el centro de notificaciones y solicita permiso para las
 * alertas del navegador.
 *
 * @module frontend/pages/admin/notificaciones
 */

/**
 * Lleva al usuario a la pantalla relacionada con la notificación.
 *
 * @param {string} tipo - `usuario`, `reporte` u otro tipo ignorado.
 * @param {number} id - Identificador del recurso.
 * @returns {void}
 */
function abrirDetalleNotificacion(tipo, id) {
    if (tipo === "usuario") {
        const enlace = [...document.querySelectorAll(".menu a")]
            .find((item) => item.getAttribute("href") === "#usuarios");
        if (enlace) irA(enlace, "#usuarios");
        window.setTimeout(() => editarUsuarioAdmin(id), 260);
        return;
    }

    if (tipo === "reporte") {
        verReporteAdmin(id);
    }
}

/**
 * Construye y abre el modal de notificaciones con acciones para marcar
 * como leídas y activar las alertas del navegador.
 *
 * @returns {void}
 */
function mostrarNotificaciones() {
    window.RunTrashNotificacionesUI.pintar({
        titulo: "Notificaciones",
        tituloId: "adminModalTitle",
        contenidoId: "adminModalContent",
        modalId: "adminModal",
        datos: notificaciones,
        alHacerClic: abrirDetalleNotificacion
    });
}

/**
 * Pide permiso para notificaciones nativas y recarga el modal.
 *
 * @returns {Promise<void>}
 */
async function activarNotificaciones() {
    try {
        await features.requestNotificationPermission();
        mostrarToast("Alertas del navegador activadas.");
        await cargarNotificaciones();
        mostrarNotificaciones();
        features.notify("RunTrash", "Recibirás alertas de la actividad de la plataforma.");
    } catch (error) {
        mostrarToast(error.message);
    }
}
