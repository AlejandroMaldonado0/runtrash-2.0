/**
 * @file Perfil del panel de operario.
 *
 * Muestra los datos del operario con el componente compartido
 * `frontend/shared/perfil.js`.
 *
 * @module frontend/pages/operario/perfil
 */

/**
 * Abre el modal con los datos del operario.
 *
 * @returns {void}
 */
function mostrarPerfil() {
    window.RunTrashPerfil.abrir({
        titulo: "Mi perfil",
        tituloId: "tituloDetalle",
        contenidoId: "detalleContenido",
        modalId: "modalDetalles",
        usuario: usuarioActual,
        rol: "operario",
        inicial: "O",
        nombreDefecto: "Operario",
        detalles: [
            { etiqueta: "Código", valor: usuarioActual?.codigo_operario || "No registrado", icono: "🔑" },
            { etiqueta: "Rol", valor: "Operario de recolección", icono: "🧭" }
        ],
        pie: '<button class="secondary" type="button" data-accion="cerrarDetalles">Cerrar</button>'
    });
}
