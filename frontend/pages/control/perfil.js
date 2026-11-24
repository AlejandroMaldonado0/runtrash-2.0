/**
 * @file Perfil del panel de control.
 *
 * Muestra los datos del ente autenticado con el componente
 * compartido `frontend/shared/perfil.js`.
 *
 * @module frontend/pages/control/perfil
 */

/**
 * Abre el modal con los datos del ente de control autenticado.
 *
 * @returns {void}
 */
function mostrarPerfil() {
    if (!usuarioActual) return;

    window.RunTrashPerfil.abrir({
        titulo: "Mi perfil",
        tituloId: "controlModalTitle",
        contenidoId: "controlModalContent",
        modalId: "controlModal",
        usuario: usuarioActual,
        rol: usuarioActual.tipo_usuario,
        inicial: (usuarioActual.nombre || "U").charAt(0),
        nombreDefecto: "Usuario",
        correoDefecto: "",
        detalles: [
            { etiqueta: "Nombre", valor: usuarioActual.nombre || "Usuario", icono: "🪪" },
            { etiqueta: "Correo", valor: usuarioActual.correo || "", icono: "✉️" },
            {
                etiqueta: "Ente",
                valor: NOMBRES_ENTE[usuarioActual.tipo_usuario] || usuarioActual.tipo_usuario,
                icono: "🏛️"
            }
        ],
        pie: '<a class="admin-primary-button full-admin-button" href="index.html" data-accion="cerrarSesion">Cerrar sesión</a>'
    });
}
