/**
 * @file Helpers de interfaz compartidos por todos los paneles.
 *
 * Reúne comportamientos que antes estaban duplicados en cada página:
 * toast, lectura de sesión, cierre de sesión y badge de notificaciones.
 * Se carga con `defer` antes del script de cada página.
 *
 * @module frontend/shared/ui-common
 */
(() => {
    "use strict";

    let toastTimer = null;

    /**
     * Muestra un mensaje breve en el contenedor `#toast`.
     *
     * @param {string} message - Texto a mostrar.
     * @returns {void}
     */
    window.mostrarToast = function mostrarToast(message) {
        const toast = document.getElementById("toast");
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    };

    /**
     * Lee el usuario guardado y, si no existe, admite `?usuario_id`
     * como compatibilidad para pruebas.
     *
     * @param {string} [nombrePorDefecto] - Nombre usado en el modo de prueba.
     * @returns {object|null} Usuario o `null`.
     */
    window.obtenerUsuario = function obtenerUsuario(nombrePorDefecto = "Usuario") {
        try {
            const guardado = localStorage.getItem("runtrash_user");
            if (guardado) return JSON.parse(guardado);
        } catch (error) {
            console.warn("No se pudo leer la sesión:", error);
        }

        const id = new URLSearchParams(location.search).get("usuario_id");
        return id ? { id: Number(id), nombre: nombrePorDefecto } : null;
    };

    /**
     * Cierra la sesión local y en el servidor, y vuelve al inicio.
     *
     * @returns {Promise<void>}
     */
    window.cerrarSesion = async function cerrarSesion() {
        const token = window.RunTrashAPI.token();

        try {
            if (token) {
                await window.RunTrashFeatures.apiFetch(
                    `${window.RunTrashAPI.base}/api/logout`,
                    { method: "POST" }
                );
            }
        } finally {
            localStorage.removeItem("runtrash_user");
            localStorage.removeItem("runtrash_token");
            window.location.href = "index.html";
        }
    };

    /**
     * Actualiza el contador visual de notificaciones.
     *
     * @param {{noLeidas?: number}} [datos] - Estado de notificaciones.
     * @returns {void}
     */
    window.actualizarBadgeNotificaciones = function actualizarBadgeNotificaciones(datos) {
        const badge = document.getElementById("notificationCount");
        if (!badge || !datos) return;

        const total = Number(datos.noLeidas || 0);
        badge.textContent = total > 99 ? "99+" : String(total);
        badge.hidden = total === 0;
    };

    /**
     * Descarga las notificaciones y refresca el badge de la campana.
     * Devuelve `null` si la petición falla para que cada página conserve
     * el último estado conocido.
     *
     * @param {string} apiBase - Base de la API (`window.RunTrashAPI.base`).
     * @returns {Promise<{notificaciones: Array, noLeidas: number}|null>} Datos o `null`.
     */
    window.cargarNotificacionesCompartidas = async function cargarNotificacionesCompartidas(apiBase) {
        try {
            const datos = await window.RunTrashFeatures.cargarNotificaciones(apiBase);
            window.actualizarBadgeNotificaciones(datos);
            return datos;
        } catch (error) {
            console.warn("No se pudieron cargar las notificaciones:", error);
            return null;
        }
    };

    /**
     * Marca todas las notificaciones como leídas y vuelve a pintar el panel.
     * Reutiliza `cargarNotificaciones` y `mostrarNotificaciones` de la página
     * que esté activa, por eso se invoca desde los botones del modal.
     *
     * @returns {Promise<void>}
     */
    window.marcarNotificacionesLeidas = async function marcarNotificacionesLeidas() {
        if (typeof window.cargarNotificaciones !== "function" || typeof window.mostrarNotificaciones !== "function") return;

        try {
            await window.RunTrashFeatures.marcarNotificacionesLeidas(window.RunTrashAPI.base);
            await window.cargarNotificaciones();
            window.mostrarNotificaciones();
        } catch (error) {
            window.mostrarToast(error.message);
        }
    };

    /**
     * Marca el enlace activo de la barra lateral y actualiza `aria-current`.
     *
     * @param {HTMLElement|null} element - Enlace seleccionado.
     * @returns {void}
     */
    window.seleccionarMenu = function seleccionarMenu(element) {
        if (!element) return;

        document.querySelectorAll(".menu a").forEach((link) => {
            link.classList.remove("active");
            link.removeAttribute("aria-current");
        });
        element.classList.add("active");
        element.setAttribute("aria-current", "page");
    };

    /**
     * Ejecuta la acción declarada en `data-accion`.
     *
     * Convención de atributos:
     * - `data-accion`: nombre de una función global (`window[nombre]`).
     * - `data-args`: array JSON con los argumentos (`'["all"]'`).
     * - `data-pasar`: `elemento` (por defecto `ninguno`) o `evento`.
     *
     * Sustituye a los atributos `onclick`/`onchange`/`onsubmit` para que la
     * CSP pueda bloquear los manejadores inline.
     *
     * @param {Event} evento - Evento DOM capturado por delegación.
     * @returns {void}
     */
    function ejecutarAccion(evento) {
        const elemento = evento.target instanceof Element
            ? evento.target.closest("[data-accion]")
            : null;

        if (!elemento) return;

        /* El formulario solo actúa en `submit`, no en clics internos. */
        if (elemento.tagName === "FORM" && evento.type !== "submit") return;

        /* `change`/`input` solo cuentan cuando el propio campo trae la acción. */
        if ((evento.type === "change" || evento.type === "input") && elemento !== evento.target) return;

        if (evento.type === "submit" || elemento.tagName === "A") {
            evento.preventDefault();
        }

        const nombre = elemento.dataset.accion;
        const accion = window[nombre];

        if (typeof accion !== "function") {
            console.warn(`Acción no registrada: ${nombre}`);
            return;
        }

        let argumentos = [];
        if (elemento.dataset.args) {
            try {
                const analizados = JSON.parse(elemento.dataset.args);
                if (Array.isArray(analizados)) argumentos = analizados;
            } catch (error) {
                console.warn(`Argumentos inválidos en la acción ${nombre}:`, error);
                return;
            }
        }

        const modo = elemento.dataset.pasar || "ninguno";

        if (modo === "elemento") {
            accion(elemento, ...argumentos);
        } else if (modo === "evento") {
            accion(evento, ...argumentos);
        } else {
            accion(...argumentos);
        }
    }

    /**
     * Reemplaza una miniatura rota por el icono del tipo de residuo.
     * Se usa como acción `error` de las imágenes generadas.
     *
     * @param {HTMLImageElement} imagen - Imagen que no pudo cargarse.
     * @returns {void}
     */
    window.imagenNoDisponible = function imagenNoDisponible(imagen) {
        if (!imagen || imagen.dataset.reemplazada === "true") return;

        const reemplazo = document.createElement("div");
        reemplazo.className = `${imagen.dataset.clase || "report-thumb"} report-thumb-vacio`;
        reemplazo.setAttribute("aria-hidden", "true");
        reemplazo.textContent = imagen.dataset.icono || "🗑️";
        imagen.replaceWith(reemplazo);
    };

    for (const tipo of ["click", "change", "input", "submit", "error"]) {
        document.addEventListener(tipo, ejecutarAccion, tipo === "error");
    }
})();
