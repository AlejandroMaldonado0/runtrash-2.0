/**
 * @file Perfil del panel administrador.
 *
 * Muestra los datos del administrador con el componente compartido
 * `frontend/shared/perfil.js`.
 *
 * @module frontend/pages/admin/perfil
 */

/**
 * Abre el modal con los datos del administrador actual.
 *
 * @returns {void}
 */
function mostrarPerfil() {
    window.RunTrashPerfil.abrir({
        titulo: "Perfil del administrador",
        tituloId: "adminModalTitle",
        contenidoId: "adminModalContent",
        modalId: "adminModal",
        usuario: usuarioActual,
        rol: "admin",
        inicial: "A",
        nombreDefecto: "Administrador",
        correoDefecto: "",
        detalles: [
            {
                etiqueta: "Permisos",
                valor: "Usuarios, configuración y estadísticas",
                icono: "🛡️"
            }
        ],
        pie: '<button class="admin-primary-button full-admin-button" type="button" data-accion="cerrarModal">Cerrar</button>'
    });
}
