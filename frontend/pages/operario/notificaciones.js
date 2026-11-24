/**
 * @file Notificaciones del panel de operario.
 *
 * Abre el centro de notificaciones y solicita permiso para las
 * alertas del navegador.
 *
 * @module frontend/pages/operario/notificaciones
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
    refrescarReportes();
}

/**
 * Abre el modal de notificaciones operativas.
 *
 * @returns {void}
 */
function mostrarNotificaciones() {
    window.RunTrashNotificacionesUI.pintar({
        titulo: "Notificaciones operativas",
        tituloId: "tituloDetalle",
        contenidoId: "detalleContenido",
        modalId: "modalDetalles",
        datos: notificaciones,
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
        mostrarToast("Alertas del navegador activadas.");
        await cargarNotificaciones();
        mostrarNotificaciones();
        features.notify("RunTrash", "Recibirás alertas sobre nuevas tareas y cambios de estado.");
    } catch (error) {
        mostrarToast(error.message);
        mostrarNotificaciones();
    }
}
