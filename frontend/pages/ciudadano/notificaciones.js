/**
 * @file Notificaciones del panel ciudadano.
 *
 * Abre el centro de notificaciones y solicita permiso para las
 * alertas del navegador.
 *
 * @module frontend/pages/ciudadano/notificaciones
 */

/**
 * Abre el reporte asociado a una notificación o recarga la lista.
 *
 * @param {string} tipo - Tipo de notificación.
 * @param {number} id - Identificador del recurso.
 * @returns {void}
 */
function abrirDetalleNotificacion(tipo, id) {
    if (tipo === "reporte") {
        verReporte(id);
        return;
    }
    cargarReportes();
}

/**
 * Abre el modal de notificaciones con las acciones de lectura y alertas.
 *
 * @returns {void}
 */
function mostrarNotificaciones() {
    window.RunTrashNotificacionesUI.pintar({
        titulo: "Notificaciones",
        tituloId: "modalTitulo",
        contenidoId: "modalContenido",
        modalId: "modal",
        datos: notificaciones,
        cardId: "modalCard",
        claseCard: "modal-card-notifications",
        mensajeInactivo: "Activa las alertas para saber cuando atiendan tu reporte.",
        alHacerClic: abrirDetalleNotificacion
    });
}

/**
 * Solicita permiso para notificaciones nativas y refresca el modal.
 *
 * @returns {Promise<void>}
 */
async function activarNotificaciones() {
    try {
        await features.requestNotificationPermission();
        mostrarToast("Notificaciones del navegador activadas.");
        await cargarNotificaciones();
        mostrarNotificaciones();
        features.notify("RunTrash", "Las actualizaciones de tus reportes aparecerán aquí.");
    } catch (error) {
        mostrarToast(error.message);
        mostrarNotificaciones();
    }
}
