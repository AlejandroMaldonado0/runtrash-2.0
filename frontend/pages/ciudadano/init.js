/**
 * @file Arranque del panel ciudadano.
 *
 * Conecta el canal de tiempo real, programa el refresco periódico
 * y reacciona a los cambios de conectividad.
 *
 * @module frontend/pages/ciudadano/init
 */

document.addEventListener("DOMContentLoaded", () => {
    features = window.RunTrashFeatures;
    if (usuarioActual?.nombre) {
        document.querySelector(".user-info strong").textContent = usuarioActual.nombre;
        document.querySelector(".user-info span").textContent = usuarioActual.correo || "Usuario RunTrash";
    }
    fetch(`${API}/api/configuracion/publica`)
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

        if (event.tipo === "estado_actualizado") {
            features.notify("Actualización de RunTrash", "Uno de tus reportes cambió de estado.");
        }
        if (event.tipo === "reporte_asignado") {
            features.notify("Asignaron un operario", "Tu reporte ya tiene responsable.");
        }
    }, (status) => {
        const service = document.querySelector(".service-status");
        if (service) service.textContent = status === "conectado" ? "En tiempo real" : "Reconectando";
    });
    /*
    Un solo coordinador reemplaza el setInterval: si una recarga tarda,
    la siguiente se omite en lugar de acumularse.
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
        mostrarToast("Conexión recuperada. Actualizando tus reportes...");
        cargarReportes(true);
    });
    window.addEventListener("beforeunload", limpiarFormularioReporte);
});
