/**
 * @file Tiempo real del panel administrador.
 *
 * Conecta el canal SSE y refresca los datos ante cada evento.
 *
 * @module frontend/pages/admin/eventos
 */

/**
 * Abre el canal SSE del panel y refresca datos ante cada evento.
 *
 * @returns {void}
 */
function connectAdminEvents() {
    adminEvents?.();
    adminEvents = features.connectEvents(API, (event) => {
        if (event.tipo === "notificaciones_leidas") return;
        cargarTodo();
        cargarNotificaciones();

        if (event.tipo === "reporte_creado") {
            features.notify("Nuevo reporte", "Entró un reporte a la plataforma.");
        }
    }, (status) => {
        const element = document.getElementById("systemStatus");
        if (element) element.textContent = status === "conectado" ? "Tiempo real" : "Reconectando";
    });
}
