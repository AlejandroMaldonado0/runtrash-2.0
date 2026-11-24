/**
 * @file Comportamiento de interfaz compartido.
 *
 * Controla el sidebar responsive, el foco y cierre de modales, las
 * etiquetas de fecha y el feedback del formulario de login. Se carga
 * en todas las páginas y no depende de jQuery ni frameworks.
 *
 * @module ui
 */
(() => {
    "use strict";

    const DESKTOP_BREAKPOINT = 820;

    /**
     * Abre o cierra el sidebar y sincroniza backdrop y `aria-expanded`.
     *
     * @param {boolean} open - `true` para abrir.
     * @returns {void}
     */
    function setSidebar(open) {
        const sidebar = document.querySelector("[data-sidebar]");
        const backdrop = document.querySelector("[data-sidebar-backdrop]");
        const toggle = document.querySelector("[data-sidebar-toggle]");

        if (!sidebar) return;

        sidebar.classList.toggle("is-open", open);
        document.body.classList.toggle("sidebar-open", open);
        backdrop?.classList.toggle("is-visible", open);
        toggle?.setAttribute("aria-expanded", String(open));

        if (open) {
            window.setTimeout(() => {
                sidebar.querySelector("[data-sidebar-close]")?.focus();
            }, 220);
        }
    }

    /**
     * Cierra el modal visible simulando el clic de su botón de cierre.
     *
     * @returns {boolean} `true` si había un modal abierto.
     */
    function closeVisibleModal() {
        const modal = document.querySelector(".modal.show, .modal.active");
        if (!modal) return false;

        const closeButton = modal.querySelector(".close, .close-modal");
        if (closeButton) {
            closeButton.click();
        } else {
            modal.classList.remove("show", "active");
        }
        return true;
    }

    /**
     * Conecta toggle, backdrop, cierre y auto-cierre del sidebar en móvil.
     *
     * @returns {void}
     */
    function initializeSidebar() {
        const toggle = document.querySelector("[data-sidebar-toggle]");
        const closeButton = document.querySelector("[data-sidebar-close]");
        const backdrop = document.querySelector("[data-sidebar-backdrop]");
        const sidebar = document.querySelector("[data-sidebar]");

        if (!sidebar) return;

        toggle?.addEventListener("click", () => {
            setSidebar(!sidebar.classList.contains("is-open"));
        });

        closeButton?.addEventListener("click", () => setSidebar(false));
        backdrop?.addEventListener("click", () => setSidebar(false));

        sidebar.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                if (window.innerWidth <= DESKTOP_BREAKPOINT) {
                    setSidebar(false);
                }
            });
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > DESKTOP_BREAKPOINT) {
                setSidebar(false);
            }
        });
    }

    /**
     * Observa cada modal para manejar `aria-hidden`, foco y scroll del body.
     *
     * @returns {void}
     */
    function initializeModals() {
        document.querySelectorAll(".modal").forEach((modal) => {
            let lastFocusedElement = null;
            let wasOpen = modal.classList.contains("show") || modal.classList.contains("active");

            /**
             * Sincroniza `aria-hidden`, foco y bloqueo de scroll al abrir o cerrar.
             * @returns {void}
             */
            const updateModal = () => {
                const isOpen = modal.classList.contains("show") || modal.classList.contains("active");
                modal.setAttribute("aria-hidden", String(!isOpen));

                if (isOpen && !wasOpen) {
                    lastFocusedElement = document.activeElement;
                    document.body.classList.add("modal-open");
                    window.requestAnimationFrame(() => {
                        const firstField = modal.querySelector("input:not([type='hidden']), textarea, select");
                        (firstField || modal.querySelector(".close, .close-modal"))?.focus();
                    });
                } else if (!isOpen && wasOpen) {
                    document.body.classList.remove("modal-open");
                    if (lastFocusedElement instanceof HTMLElement) {
                        lastFocusedElement.focus();
                    }
                }

                wasOpen = isOpen;
            };

            new MutationObserver(updateModal).observe(modal, {
                attributes: true,
                attributeFilter: ["class"]
            });

            updateModal();
        });
    }

    /**
     * Rellena los elementos `[data-current-date]` con la fecha actual.
     *
     * @returns {void}
     */
    function initializeDateLabels() {
        const formatter = new Intl.DateTimeFormat("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long"
        });

        document.querySelectorAll("[data-current-date]").forEach((element) => {
            const date = formatter.format(new Date());
            element.textContent = date.charAt(0).toUpperCase() + date.slice(1);
        });
    }

    /**
     * Limpia el mensaje de error del login cuando el usuario vuelve a escribir.
     *
     * @returns {void}
     */
    function initializeLoginFeedback() {
        const form = document.getElementById("loginForm");
        const message = document.getElementById("mensajeLogin");

        if (!form || !message) return;

        form.addEventListener("input", () => {
            message.className = "mensaje";
            message.textContent = "";
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        if (document.body.classList.contains("sidebar-open")) {
            setSidebar(false);
            return;
        }

        closeVisibleModal();
    });

    document.addEventListener("DOMContentLoaded", () => {
        initializeSidebar();
        initializeModals();
        initializeDateLabels();
        initializeLoginFeedback();
    });
})();
