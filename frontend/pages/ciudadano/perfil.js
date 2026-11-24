/**
 * @file Perfil del panel ciudadano.
 *
 * Muestra los datos del ciudadano con el componente compartido
 * `frontend/shared/perfil.js`.
 *
 * @module frontend/pages/ciudadano/perfil
 */

/**
 * Abre el modal con los datos del ciudadano.
 *
 * @returns {void}
 */
function mostrarPerfil() {
    window.RunTrashPerfil.abrir({
        titulo: "Mi perfil",
        tituloId: "modalTitulo",
        contenidoId: "modalContenido",
        modalId: "modal",
        usuario: usuarioActual,
        rol: "ciudadano",
        inicial: "C",
        nombreDefecto: "Ciudadano",
        detalles: [
            { etiqueta: "Rol", valor: "Ciudadano", icono: "🧭" },
            {
                etiqueta: "Miembro desde",
                valor: usuarioActual?.fecha_registro
                    ? fechaBonita(usuarioActual.fecha_registro)
                    : "Información no disponible",
                icono: "📅"
            }
        ],
        pie: '<button class="secondary" type="button" data-accion="cerrarModal">Cerrar</button>'
    });
}
