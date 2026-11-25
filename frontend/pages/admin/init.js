/**
 * @file Arranque del panel administrador.
 *
 * Verifica la sesión, conecta el tiempo real y programa el refresco
 * periódico.
 *
 * @module frontend/pages/admin/init
 */

document.addEventListener("DOMContentLoaded", async () => {
    features = window.RunTrashFeatures;
    document.getElementById("configForm").addEventListener("submit", guardarConfiguracion);

    const usuariosBusqueda = document.getElementById("usuariosBusqueda");
    const usuariosFiltroRol = document.getElementById("usuariosFiltroRol");

    usuariosBusqueda?.addEventListener("input", () => renderUsuarios());
    usuariosFiltroRol?.addEventListener("change", () => renderUsuarios());

    if (!token || usuarioActual?.tipo_usuario !== "admin") {
        mostrarGate();
        return;
    }

    ocultarGate();
    document.querySelector(".user-info strong").textContent = usuarioActual.nombre;
    document.querySelector(".user-info span").textContent = usuarioActual.correo || "Sistema RunTrash";
    await cargarTodo();
    await cargarNotificaciones();
    connectAdminEvents();
    window.addEventListener("pagehide", () => Concurrencia.cancelarTodo());
});
