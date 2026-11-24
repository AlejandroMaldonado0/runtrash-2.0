/**
 * @file Arranque del panel de control.
 *
 * Verifica el rol, rellena filtros, carga datos y programa el
 * refresco periódico.
 *
 * @module frontend/pages/control/init
 */

document.addEventListener("DOMContentLoaded", async () => {
    features = window.RunTrashFeatures;

    /* Solo los entes de control y el administrador pueden ver este panel. */
    if (!token || !usuarioActual || !ROLES_CONTROL.includes(usuarioActual.tipo_usuario)) {
        window.location.href = "index.html";
        return;
    }

    const nombreEnte = NOMBRES_ENTE[usuarioActual.tipo_usuario] || "Ente de control";
    const esAdmin = usuarioActual.tipo_usuario === "admin";

    document.getElementById("controlEnteNombre").textContent = nombreEnte;
    document.getElementById("controlHeroTitulo").textContent = `Panel de ${nombreEnte}`;
    document.getElementById("controlHeroTexto").textContent = esAdmin
        ? "Consulta el estado de todos los reportes y el historial completo de la ciudad."
        : "Consulta los reportes de la ciudad y deja seguimientos. Tu historial es privado de tu ente.";
    document.getElementById("controlSeguimientosTh").textContent = esAdmin
        ? "Seguimientos"
        : "Mis seguimientos";
    document.getElementById("controlApp").hidden = false;

    llenarLocalidades();
    await refrescarTodo();
    iniciarRealtime();

    window.addEventListener("beforeunload", () => controlEvents?.());
    window.addEventListener("pagehide", () => Concurrencia.cancelarTodo());
});
