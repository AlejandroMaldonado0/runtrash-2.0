/**
 * @file Arranque del panel de operario.
 *
 * Conecta el tiempo real, programa el refresco periódico y
 * reacciona a los cambios de conectividad.
 *
 * @module frontend/pages/operario/init
 */

document.addEventListener("DOMContentLoaded", () => {
    features = window.RunTrashFeatures;
    if (usuarioActual?.nombre) {
        document.querySelector(".user-info strong").textContent = usuarioActual.nombre;
        document.querySelector(".user-info span").textContent = usuarioActual.codigo_operario ? `Código ${usuarioActual.codigo_operario}` : "Operario RunTrash";
    }
    features.apiFetch(`${API}/api/configuracion/publica`)
        .then((response) => response.json())
        .then((data) => {
            if (data.ok) configuracion = { ...configuracion, ...data.configuracion };
        })
        .catch(() => {});
    cargarReportes();
    cargarNotificaciones();
    features.connectEvents(API, async (event) => {
        if (event.tipo === "notificaciones_leidas") return;

        await Concurrencia.enParaleloSeguro([
            () => cargarReportes(true, false),
            () => cargarNotificaciones()
        ]);

        if (event.tipo === "reporte_asignado" && Number(event.operario_id) === Number(usuarioActual?.id)) {
            features.notify("Nueva tarea asignada", "Abre RunTrash para revisar el reporte.");
        }
        if (event.tipo === "estado_actualizado") {
            features.notify("Cambio de estado", "Una tarea de tu ruta cambió de estado.");
        }
    }, (status) => {
        const service = document.querySelector(".service-status");
        if (service) service.textContent = status === "conectado" ? "Tiempo real" : "Reconectando";
    });
    /*
    El sondeo usa el coordinador: nunca se solapa con la carga anterior
    ni con la que dispara el canal de tiempo real.
    */
    const refresco = Concurrencia.crearRefresco(
        () => Concurrencia.enParaleloSeguro([
            () => cargarReportes(true),
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
        mostrarToast("Conexión recuperada. Actualizando las tareas...");
        cargarReportes(true);
    });
});
