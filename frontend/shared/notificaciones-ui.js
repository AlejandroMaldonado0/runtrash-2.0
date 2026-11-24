/**
 * @file Componente compartido del centro de notificaciones.
 *
 * Centraliza la barra de estado, el aviso de alertas del navegador y el
 * pintado del modal que antes se duplicaba en cada panel. Expone
 * `window.RunTrashNotificacionesUI`.
 *
 * @module frontend/shared/notificaciones-ui
 */
(() => {
    "use strict";

    /**
     * Construye la barra superior del modal de notificaciones.
     *
     * @param {object} [opciones] - Configuración de la barra.
     * @param {number} [opciones.noLeidas=0] - Notificaciones sin leer.
     * @param {{activo: boolean, bloqueado?: boolean}} [opciones.estadoAlertas] - Estado del permiso.
     * @param {string} [opciones.mensajeInactivo] - Texto cuando las alertas están apagadas.
     * @param {string} [opciones.accionLeidas="marcarNotificacionesLeidas"] - Acción del botón de lectura.
     * @param {string} [opciones.accionActivar="activarNotificaciones"] - Acción del botón de alertas.
     * @returns {string} HTML de la barra.
     */
    function construirBarra(opciones = {}) {
        const {
            noLeidas = 0,
            estadoAlertas = null,
            mensajeInactivo = "Activa las alertas para recibir avisos aunque la pestaña esté en segundo plano.",
            accionLeidas = "marcarNotificacionesLeidas",
            accionActivar = "activarNotificaciones"
        } = opciones;

        const estado = estadoAlertas || window.RunTrashFeatures?.textoBotonAlertas?.()
            || { activo: false, bloqueado: false };

        return `
            <div class="notification-toolbar">
                <p>${noLeidas > 0
                    ? `Tienes ${noLeidas} ${noLeidas === 1 ? "aviso" : "avisos"} sin leer.`
                    : "Estás al día con tus avisos."}</p>
                ${noLeidas > 0
                    ? `<button class="secondary" type="button" data-accion="${accionLeidas}">Marcar como leídas</button>`
                    : ""}
            </div>
            <div class="alerta-estado ${estado.activo ? "is-activa" : ""}">
                <span aria-hidden="true">${estado.activo ? "🔔" : "🔕"}</span>
                <span>${estado.activo
                    ? "Las alertas del navegador están activadas."
                    : estado.bloqueado
                        ? "Tu navegador bloqueó las alertas. Habilítalas en los permisos del sitio."
                        : mensajeInactivo}</span>
                ${estado.activo ? "" : `<button type="button" data-accion="${accionActivar}" ${estado.bloqueado ? "disabled" : ""}>Activar</button>`}
            </div>`;
    }

    /**
     * Pinta un modal de notificaciones completo.
     *
     * @param {object} opciones - Configuración del modal.
     * @param {string} opciones.titulo - Título del modal.
     * @param {string} opciones.tituloId - Id del título.
     * @param {string} opciones.contenidoId - Id del contenedor.
     * @param {string} opciones.modalId - Id del modal.
     * @param {{notificaciones: Array<object>, noLeidas: number}} opciones.datos - Datos cargados.
     * @param {string} [opciones.mensajeInactivo] - Texto de alertas apagadas.
     * @param {string} [opciones.cardId] - Id de la tarjeta para añadir una clase.
     * @param {string} [opciones.claseCard] - Clase adicional para la tarjeta.
     * @param {Function} [opciones.alHacerClic] - Callback al abrir una notificación.
     * @returns {void}
     */
    function pintar(opciones) {
        const {
            titulo,
            tituloId,
            contenidoId,
            modalId,
            datos,
            mensajeInactivo,
            cardId,
            claseCard,
            alHacerClic
        } = opciones;

        const tituloEl = document.getElementById(tituloId);
        if (tituloEl) tituloEl.textContent = titulo;

        if (cardId && claseCard) {
            document.getElementById(cardId)?.classList.add(claseCard);
        }

        const contenido = document.getElementById(contenidoId);
        const features = window.RunTrashFeatures;

        features.renderNotificaciones(
            contenido,
            datos.notificaciones || [],
            { alHacerClic }
        );

        contenido.insertAdjacentHTML("afterbegin", construirBarra({
            noLeidas: Number(datos.noLeidas || 0),
            mensajeInactivo
        }));

        document.getElementById(modalId)?.classList.add("show");
    }

    window.RunTrashNotificacionesUI = Object.freeze({
        construirBarra,
        pintar
    });
})();
