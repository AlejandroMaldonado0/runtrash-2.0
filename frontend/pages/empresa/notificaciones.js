/**
 * @file Notificaciones del panel de empresa.
 *
 * Abre el centro de notificaciones y solicita permiso para las
 * alertas del navegador.
 *
 * @module frontend/pages/empresa/notificaciones
 */

/**
 * Abre el reporte asociado a una notificación o vuelve al inicio.
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
    irAInicio();
}

/**
 * Abre el modal de notificaciones de la empresa.
 *
 * @returns {void}
 */
function mostrarNotificaciones() {
    window.RunTrashNotificacionesUI.pintar({
        titulo: "Notificaciones operativas",
        tituloId: "modalTitulo",
        contenidoId: "modalContenido",
        modalId: "modal",
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
        features.notify("RunTrash", "Recibirás alertas cuando lleguen reportes nuevos.");
    } catch (error) {
        mostrarToast(error.message);
        mostrarNotificaciones();
    }
}
