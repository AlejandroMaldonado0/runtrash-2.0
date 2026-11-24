/**
 * @file Perfil del panel de empresa.
 *
 * Muestra los datos de la empresa usando el componente compartido
 * `frontend/shared/perfil.js`.
 *
 * @module frontend/pages/empresa/perfil
 */

/**
 * Abre el modal con los datos de la empresa.
 *
 * @returns {void}
 */
function mostrarPerfil() {
    window.RunTrashPerfil.abrir({
        titulo: "Perfil de empresa",
        tituloId: "modalTitulo",
        contenidoId: "modalContenido",
        modalId: "modal",
        usuario: usuarioActual,
        rol: "empresa",
        inicial: "E",
        nombreDefecto: "Empresa",
        detalles: [
            { etiqueta: "NIT", valor: usuarioActual?.nit_empresa || "No registrado", icono: "🧾" },
            { etiqueta: "Rol", valor: "Empresa de recolección", icono: "🧭" }
        ],
        pie: '<button class="secondary" type="button" data-accion="cerrarModal">Cerrar</button>'
    });
}
