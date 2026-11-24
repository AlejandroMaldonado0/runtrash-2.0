/**
 * @file Arranque del panel de empresa.
 *
 * Conecta el canal de tiempo real, programa el refresco periódico
 * y reacciona a los cambios de conectividad.
 *
 * @module frontend/pages/empresa/init
 */

document.addEventListener("DOMContentLoaded", () => {
    features = window.RunTrashFeatures;
    if (usuarioActual?.nombre) {
        document.querySelector(".user-info strong").textContent = usuarioActual.nombre;
        document.querySelector(".user-info span").textContent = usuarioActual.nit_empresa ? `NIT ${usuarioActual.nit_empresa}` : "Empresa RunTrash";
    }
    cargarDatos();
    cargarNotificaciones();
    features.connectEvents(API, async (event) => {
        if (event.tipo === "notificaciones_leidas") return;

        await Concurrencia.enParaleloSeguro([
            () => cargarDatos(true, false),
            () => cargarNotificaciones()
        ]);

        const pendiente = reportes.filter((report) => report.estado === "pendiente" && !report.operario_id).length;

        if (event.tipo === "reporte_creado") {
            features.notify(
                "Nuevo reporte recibido",
                `Quedan ${pendiente} reportes por asignar.`
            );
        }

        if (event.tipo === "estado_actualizado") {
            features.notify("Actualización de estado", "Un reporte cambió de estado.");
        }
    }, (status) => {
        const service = document.querySelector(".service-status");
        if (service) service.textContent = status === "conectado" ? "Tiempo real" : "Reconectando";
    });
    /*
    El sondeo comparte coordinador con el canal de tiempo real, así que
    una recarga lenta no se superpone con la siguiente.
    */
    const refresco = Concurrencia.crearRefresco(
        () => Concurrencia.enParaleloSeguro([
            () => cargarDatos(true),
            () => cargarNotificaciones()
        ]),
        { intervalo: 30000 }
    );
    refresco.iniciar();
    window.addEventListener("pagehide", () => {
        refresco.detener();
        Concurrencia.cancelarTodo();
    });
    window.addEventListener("online", () => {
        mostrarToast("Conexión recuperada. Actualizando los reportes...");
        cargarDatos(true);
    });
});
