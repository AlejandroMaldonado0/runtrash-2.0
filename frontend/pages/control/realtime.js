/**
 * @file Tiempo real del panel de control.
 *
 * Conecta el canal SSE para refrescar el panel ante cambios.
 *
 * @module frontend/pages/control/realtime
 */

/**
 * Abre el canal SSE para refrescar el panel cuando cambie algún reporte.
 *
 * @returns {void}
 */
function iniciarRealtime() {
    controlEvents = features.connectEvents(
        API,
        () => refrescarTodo(),
        (estado) => {
            document.getElementById("systemStatus").textContent =
                estado === "conectado" ? "En línea" : "Reconectando";
        }
    );
}
