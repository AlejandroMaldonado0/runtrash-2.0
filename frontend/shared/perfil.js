/**
 * @file Componente compartido de perfil de usuario.
 *
 * Unifica la tarjeta, la foto editable y el cuadro de resumen de
 * reportes que antes no existían en los modales de ciudadano, empresa,
 * operario, administración y control. El resumen se pide a
 * `/api/perfil/resumen`, que decide el alcance según el rol.
 *
 * Expone `window.RunTrashPerfil`.
 *
 * @module frontend/shared/perfil
 */
(() => {
    "use strict";

    /** Tamaño del avatar que se guarda (px, cuadrado). */
    const LADO_AVATAR = 256;

    /** Peso máximo del archivo original que acepta el navegador. */
    const PESO_MAXIMO = 8 * 1024 * 1024;

    /** Formatos de imagen aceptados por el selector de archivos. */
    const FORMATOS = new Set(["image/png", "image/jpeg", "image/webp"]);

    /** Estados posibles de un reporte, en el orden que se muestran. */
    const ESTADOS = ["pendiente", "en proceso", "completado"];

    /** Etiquetas de las pestañas del resumen. */
    const ETIQUETAS = {
        resumen: "Resumen",
        pendiente: "Pendientes",
        "en proceso": "En proceso",
        completado: "Completados"
    };

    /**
     * Reglas de XP que el servidor aplica sobre la actividad real.
     *
     * @type {ReadonlyArray<{clave: string, puntos: number, icono: string, texto: string}>}
     */
    const REGLAS_XP = Object.freeze([
        { clave: "enviados", puntos: 50, icono: "📨", texto: "por reporte enviado" },
        { clave: "fotoGeo", puntos: 20, icono: "📍", texto: "con foto y ubicación exacta" },
        { clave: "enProceso", puntos: 30, icono: "🚛", texto: "cuando pasa a en proceso" },
        { clave: "completados", puntos: 100, icono: "✅", texto: "por reporte resuelto" },
        { clave: "racha", puntos: 50, icono: "🔥", texto: "por racha de la semana" }
    ]);

    /**
     * Cortes de la escala de niveles.
     *
     * Conserva los hitos de la especificación (Nivel 5 desde 500 XP,
     * Nivel 10 desde 2000 XP y Nivel 20+ desde 5000 XP) con bandas
     * intermedias de 100 a 600 XP para que la barra avance seguido.
     *
     * @type {number[]}
     */
    const UMBRALES = Object.freeze([
        0, 100, 200, 350, 500, 700, 950, 1250, 1600, 2000,
        2600, 3100, 3500, 3900, 4300, 4600, 4800, 4900, 4950, 5000
    ]);

    /** Títulos de la escala según los XP acumulados. */
    const TITULOS = Object.freeze([
        { desde: 0, titulo: "Observador Urbano", emoji: "👁️" },
        { desde: 500, titulo: "Colaborador Activo", emoji: "🚴" },
        { desde: 2000, titulo: "Ciudadano Estrella", emoji: "⭐" },
        { desde: 5000, titulo: "Guardián de la Ciudad", emoji: "🏙️🏆" }
    ]);

    /** Formato de números en español de Colombia. */
    const formatoXP = new Intl.NumberFormat("es-CO");

    /**
     * Calcula el nivel que corresponde a un total de XP.
     *
     * @param {number} totalXP - XP acumulados.
     * @returns {number} Nivel (1 o más).
     */
    function nivelDesdeXP(totalXP) {
        const xp = Math.max(0, Number(totalXP) || 0);
        if (xp >= 5000) return 20 + Math.floor((xp - 5000) / 1000);

        let nivel = 1;
        UMBRALES.forEach((umbral, indice) => {
            if (xp >= umbral) nivel = indice + 1;
        });

        return nivel;
    }

    /**
     * Devuelve el título y el emoji del nivel alcanzado.
     *
     * @param {number} totalXP - XP acumulados.
     * @returns {{desde: number, titulo: string, emoji: string}} Título.
     */
    function tituloDesdeXP(totalXP) {
        return [...TITULOS]
            .reverse()
            .find((item) => Number(totalXP) >= item.desde) || TITULOS[0];
    }

    /**
     * Datos completos de la banda de nivel actual.
     *
     * @param {number} totalXP - XP acumulados.
     * @returns {{nivel: number, inicio: number, siguiente: number, xpEnNivel: number, xpNecesario: number, porcentaje: number, titulo: string, emoji: string}} Banda.
     */
    function datosNivel(totalXP) {
        const xp = Math.max(0, Number(totalXP) || 0);
        const nivel = nivelDesdeXP(xp);
        const inicio = nivel >= 20 ? 5000 + (nivel - 20) * 1000 : UMBRALES[nivel - 1];
        const siguiente = nivel >= 20 ? inicio + 1000 : UMBRALES[nivel];
        const xpEnNivel = xp - inicio;
        const xpNecesario = siguiente - inicio;

        return {
            nivel,
            inicio,
            siguiente,
            xpEnNivel,
            xpNecesario,
            porcentaje: Math.min(100, Math.round((xpEnNivel / xpNecesario) * 100)),
            ...tituloDesdeXP(xp)
        };
    }

    /**
     * Catálogo visual de roles: emoji, color, descripción y guía rápida.
     * Se usa para que el perfil explique el rol sin depender de cada panel.
     *
     * @type {Object<string, {emoji: string, etiqueta: string, descripcion: string, pasos: string[], clase: string}>}
     */
    const ROLES = {
        ciudadano: {
            emoji: "👤",
            etiqueta: "Ciudadano",
            descripcion: "Reportas residuos y sigues el estado de tus solicitudes.",
            pasos: [
                "Registra un reporte con foto y ubicación.",
                "Sigue el estado desde el resumen de actividad.",
                "Recibe avisos cuando tu reporte avance."
            ],
            clase: "ciudadano"
        },
        empresa: {
            emoji: "🏢",
            etiqueta: "Empresa",
            descripcion: "Coordinas la recolección y el equipo operativo de tu empresa.",
            pasos: [
                "Revisa los reportes asignados a tu empresa.",
                "Asigna operarios y comparte sus códigos.",
                "Confirma la recolección con evidencia."
            ],
            clase: "empresa"
        },
        operario: {
            emoji: "👷",
            etiqueta: "Operario",
            descripcion: "Atiendes las rutas de recolección que te asigna tu empresa.",
            pasos: [
                "Consulta tu ruta y los reportes del día.",
                "Marca en proceso cuando llegues al punto.",
                "Adjunta la evidencia y completa el reporte."
            ],
            clase: "operario"
        },
        admin: {
            emoji: "🛡️",
            etiqueta: "Administrador",
            descripcion: "Cuidas la operación, los usuarios y la configuración del servicio.",
            pasos: [
                "Gestiona usuarios, roles y accesos.",
                "Supervisa reportes y estadísticas.",
                "Ajusta la configuración de la plataforma."
            ],
            clase: "admin"
        },
        distrito: {
            emoji: "🏛️",
            etiqueta: "Distrito",
            descripcion: "Acompañas la gestión ambiental y ciudadana de tu localidad.",
            pasos: [
                "Consulta los reportes de tu localidad.",
                "Registra seguimientos ciudadanos.",
                "Reporta novedades al equipo operativo."
            ],
            clase: "distrito"
        },
        policia: {
            emoji: "🚓",
            etiqueta: "Policía",
            descripcion: "Apoyas el control y la convivencia en la ciudad.",
            pasos: [
                "Consulta los reportes de tu zona.",
                "Registra seguimientos y observaciones.",
                "Escala los casos que requieran atención."
            ],
            clase: "policia"
        },
        sspd: {
            emoji: "⚖️",
            etiqueta: "SSPD",
            descripcion: "Supervisas la prestación del servicio público de aseo.",
            pasos: [
                "Supervisa la operación y los reportes.",
                "Revisa los seguimientos de los entes.",
                "Deja observaciones de control."
            ],
            clase: "sspd"
        }
    };

    /** Rol de respaldo cuando el usuario no tiene un tipo reconocido. */
    const ROL_POR_DEFECTO = {
        emoji: "🌱",
        etiqueta: "Usuario",
        descripcion: "Participas en el cuidado del entorno desde RunTrash.",
        pasos: [
            "Explora los reportes de tu zona.",
            "Mantén tus datos de contacto al día.",
            "Consulta la guía de tu actividad."
        ],
        clase: "usuario"
    };

    /** Iconos sugeridos para las filas de datos del perfil. */
    const ICONOS_DETALLE = [
        ["rol|permiso", "🧭"],
        ["nit", "🧾"],
        ["c[oó]digo", "🔑"],
        ["miembro|desde|fecha", "📅"],
        ["correo|email", "✉️"],
        ["nombre", "🪪"],
        ["ente|distrito", "🏛️"],
        ["zona|localidad", "🗺️"],
        ["tel[eé]fono|celular", "📞"],
        ["direcci[oó]n|ubicaci[oó]n", "📍"]
    ];

    /**
     * Estado interno de cada modal abierto, indexado por contenedor.
     * @type {WeakMap<HTMLElement, object>}
     */
    const estados = new WeakMap();

    /**
     * Escapa texto para insertarlo en HTML.
     *
     * @param {*} valor - Valor a escapar.
     * @returns {string} Texto seguro.
     */
    function escapar(valor) {
        const features = window.RunTrashFeatures;
        if (features?.escapeHTML) return features.escapeHTML(valor);
        return String(valor ?? "");
    }

    /**
     * Devuelve solo un data URL de imagen seguro.
     *
     * @param {*} valor - Posible avatar.
     * @returns {string} Data URL válido o cadena vacía.
     */
    function avatarSeguro(valor) {
        const texto = String(valor || "").trim();
        return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(texto)
            ? texto
            : "";
    }

    /**
     * Obtiene el token de la sesión actual.
     *
     * @returns {string} Token o cadena vacía.
     */
    function tokenActual() {
        if (window.RunTrashAPI?.token) return window.RunTrashAPI.token();
        return localStorage.getItem("runtrash_token") || "";
    }

    /**
     * Base de la API tal como la resolvió `frontend/shared/api.js`.
     *
     * @returns {string} URL base sin barra final.
     */
    function baseApi() {
        return String(
            window.RunTrashAPI?.base
            || window.RUNTRASH_API
            || window.API
            || (window.location.protocol === "file:" ? "http://localhost:3000" : "")
            || window.location.origin
        ).replace(/\/+$/, "");
    }

    /**
     * Formatea una fecha con el helper global si está disponible.
     *
     * @param {string|Date} fecha - Fecha del reporte.
     * @returns {string} Fecha legible.
     */
    function fechaBonita(fecha) {
        if (window.RunTrashFeatures?.fechaBonita) {
            return window.RunTrashFeatures.fechaBonita(fecha);
        }

        return fecha ? new Date(fecha).toLocaleDateString("es-CO") : "";
    }

    /**
     * Traduce el estado a su etiqueta visible.
     *
     * @param {string} estado - Estado interno.
     * @returns {string} Etiqueta.
     */
    function textoEstado(estado) {
        return window.RunTrashFeatures?.textoEstado
            ? window.RunTrashFeatures.textoEstado(estado)
            : ETIQUETAS[estado] || estado;
    }

    /**
     * Clase visual del estado (`pending`, `progress`, `done`).
     *
     * @param {string} estado - Estado interno.
     * @returns {string} Clase.
     */
    function claseEstado(estado) {
        return window.RunTrashFeatures?.claseEstado
            ? window.RunTrashFeatures.claseEstado(estado)
            : "pending";
    }

    /**
     * Obtiene la clave normalizada del rol del usuario.
     *
     * @param {string|object|null} rol - Rol explícito o metadatos.
     * @param {object|null} usuario - Usuario autenticado.
     * @returns {string} Clave en minúsculas.
     */
    function claveRol(rol, usuario) {
        const valor = typeof rol === "string"
            ? rol
            : rol?.clave || rol?.tipo_usuario || "";
        return String(valor || usuario?.tipo_usuario || "")
            .trim()
            .toLowerCase();
    }

    /**
     * Resuelve los metadatos visuales del rol con un respaldo seguro.
     *
     * @param {string|object|null} rol - Rol explícito o metadatos.
     * @param {object|null} usuario - Usuario autenticado.
     * @returns {{emoji: string, etiqueta: string, descripcion: string, pasos: string[], clase: string}} Rol resuelto.
     */
    function resolverRol(rol, usuario) {
        const clave = claveRol(rol, usuario);
        const base = ROLES[clave] || ROL_POR_DEFECTO;

        if (rol && typeof rol === "object") {
            return {
                ...base,
                ...rol,
                etiqueta: rol.etiqueta || base.etiqueta,
                pasos: Array.isArray(rol.pasos) && rol.pasos.length
                    ? rol.pasos
                    : base.pasos,
                clase: rol.clase || clave || base.clase
            };
        }

        return { ...base, clave };
    }

    /**
     * Elige un icono para una fila de datos según su etiqueta.
     *
     * @param {string} etiqueta - Texto visible de la fila.
     * @param {string} [explicito] - Icono indicado por el panel.
     * @returns {string} Emoji decorativo.
     */
    function iconoDetalle(etiqueta, explicito) {
        if (explicito) return explicito;

        const texto = String(etiqueta || "").toLowerCase();
        const encontrado = ICONOS_DETALLE.find(([clave]) => {
            return new RegExp(clave, "i").test(texto);
        });

        return encontrado ? encontrado[1] : "📌";
    }

    /**
     * Elige la ilustración y el color según el tipo de reporte.
     *
     * @param {string} tipo - Tipo de residuo.
     * @returns {{icono: string, clase: string}} Ilustración.
     */
    function ilustracion(tipo) {
        const valor = String(tipo || "").toLowerCase();

        if (valor.includes("zona verde") || valor.includes("árbol") || valor.includes("parque")) {
            return { icono: "🌿", clase: "verde" };
        }

        if (valor.includes("vía") || valor.includes("via") || valor.includes("calle")) {
            return { icono: "🚧", clase: "ambar" };
        }

        if (valor.includes("acumul") || valor.includes("basura") || valor.includes("residuo")) {
            return { icono: "🗑️", clase: "agua" };
        }

        return { icono: "♻️", clase: "neutro" };
    }

    /**
     * Muestra un aviso si la página tiene el componente de toasts.
     *
     * @param {string} mensaje - Texto a mostrar.
     * @returns {void}
     */
    function avisar(mensaje) {
        if (typeof window.mostrarToast === "function") {
            window.mostrarToast(mensaje);
        }
    }

    /**
     * Pinta la foto en el icono de la barra lateral de cualquier panel.
     *
     * @param {string} avatar - Data URL o cadena vacía.
     * @returns {void}
     */
    function pintarAvatarGlobal(avatar) {
        const icono = document.querySelector(".user-icon");
        if (!icono) return;

        const foto = avatarSeguro(avatar);

        icono.innerHTML = foto
            ? `<img src="${escapar(foto)}" alt="Foto de perfil">`
            : "👤";
    }

    /**
     * Recupera el avatar guardado al cargar la página.
     *
     * @returns {void}
     */
    function iniciarAvatarGlobal() {
        try {
            const usuario = JSON.parse(
                localStorage.getItem("runtrash_user") || "null"
            );

            if (usuario?.avatar_url) pintarAvatarGlobal(usuario.avatar_url);
        } catch (error) {
            /* Un localStorage corrupto no debe romper el panel. */
        }
    }

    /**
     * Construye el HTML del avatar editable con el marco de nivel.
     *
     * @param {object|null} usuario - Usuario autenticado.
     * @param {string} inicial - Inicial de respaldo.
     * @param {boolean} [mostrarNivel=false] - Mostrar el globo de nivel.
     * @returns {string} HTML del avatar.
     */
    function htmlAvatar(usuario, inicial, mostrarNivel = false) {
        const foto = avatarSeguro(usuario?.avatar_url);
        const letra = String(inicial || usuario?.nombre || "U")
            .charAt(0)
            .toUpperCase();

        return `
            <div class="perfil-avatar-wrap">
                <div class="perfil-avatar-marco">
                    <button class="perfil-avatar${foto ? " tiene-foto" : ""}"
                            type="button"
                            data-perfil-foto
                            title="Cambiar foto de perfil"
                            aria-label="Cambiar foto de perfil">
                        ${foto
                            ? `<img src="${escapar(foto)}" alt="Foto de perfil">`
                            : `<span>${escapar(letra)}</span>`}
                        <span class="perfil-avatar-cam" aria-hidden="true">📷</span>
                    </button>
                </div>
                ${mostrarNivel
                    ? `<span class="perfil-avatar-nivel" data-perfil-avatar-nivel title="Nivel actual">1</span>`
                    : ""}
                <button class="perfil-avatar-quitar" type="button"
                        data-perfil-quitar-foto ${foto ? "" : "hidden"}>
                    Quitar foto
                </button>
                <input class="perfil-avatar-input" type="file"
                       accept="image/png,image/jpeg,image/webp"
                       data-perfil-input aria-label="Seleccionar foto de perfil">
            </div>`;
    }

    /**
     * Construye la cabecera degradada con avatar, identidad y nivel.
     *
     * @param {object|null} usuario - Usuario autenticado.
     * @param {object} rol - Rol resuelto.
     * @param {string} nombre - Nombre visible.
     * @param {string} correo - Correo visible.
     * @param {string} inicial - Inicial del avatar.
     * @param {boolean} mostrarNivel - Incluir insignia y globo de nivel.
     * @returns {string} HTML de la cabecera.
     */
    function htmlHero(usuario, rol, nombre, correo, inicial, mostrarNivel) {
        return `
            <header class="perfil-hero perfil-rol-${escapar(rol.clase)}">
                <span class="perfil-hero-adorno" aria-hidden="true"></span>
                <div class="perfil-hero-top">
                    <span class="perfil-hero-chip">
                        <span class="perfil-hero-punto" aria-hidden="true"></span>
                        Perfil ${escapar(String(rol.etiqueta || "usuario").toLowerCase())}
                    </span>
                    <button class="perfil-hero-cerrar" type="button" data-perfil-cerrar
                            aria-label="Cerrar perfil" title="Cerrar perfil">×</button>
                </div>
                <div class="perfil-hero-cuerpo">
                    ${htmlAvatar(usuario, inicial, mostrarNivel)}
                    <div class="perfil-identidad-info">
                        <span class="perfil-rol-chip">
                            <span aria-hidden="true">${escapar(rol.emoji)}</span>
                            ${escapar(rol.etiqueta)}
                        </span>
                        <h3>${escapar(nombre)}</h3>
                        <p class="perfil-correo">
                            <span aria-hidden="true">📧</span>
                            ${escapar(correo)}
                        </p>
                        ${mostrarNivel
                            ? `<p class="perfil-nivel" data-perfil-nivel>
                                   <span aria-hidden="true">⭐</span>
                                   Calculando tu nivel…
                               </p>`
                            : `<p class="perfil-rol-descripcion">${escapar(rol.descripcion)}</p>`}
                    </div>
                </div>
            </header>`;
    }

    /**
     * Construye la tarjeta de gamificación del ciudadano.
     *
     * Los valores arrancan en cero y se completan cuando llega el
     * resumen real desde `/api/perfil/resumen`.
     *
     * @returns {string} HTML de la tarjeta.
     */
    function htmlXP() {
        return `
            <section class="perfil-xp" data-perfil-xp aria-labelledby="perfilXpTitulo">
                <div class="perfil-xp-cabecera">
                    <span class="perfil-xp-icono" aria-hidden="true">⚡</span>
                    <div class="perfil-xp-titulo">
                        <span>Tu energía ciudadana</span>
                        <h4 id="perfilXpTitulo">Progreso de Experiencia (XP)</h4>
                        <p class="perfil-xp-objetivo" data-perfil-xp-objetivo>
                            Siguiente objetivo: Nivel 2
                        </p>
                    </div>
                    <p class="perfil-xp-cifra">
                        <strong data-perfil-xp-actual>0</strong>
                        <span class="perfil-xp-sep">/</span>
                        <span data-perfil-xp-meta>100</span>
                        <small>XP</small>
                    </p>
                </div>

                <div class="perfil-xp-barra" data-perfil-xp-barra
                     role="progressbar"
                     aria-label="Progreso hacia el siguiente nivel"
                     aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span class="perfil-xp-fill" data-perfil-xp-fill></span>
                </div>

                <div class="perfil-xp-pie">
                    <span data-perfil-xp-falta>Te faltan 100 XP para el Nivel 2</span>
                    <span><strong data-perfil-xp-total>0</strong> XP acumulados</span>
                </div>

                <div class="perfil-xp-chips" aria-label="Cómo ganar puntos">
                    <span class="is-ambar">🎯 +100 XP por reporte resuelto</span>
                    <span class="is-verde">📨 +50 XP por reporte enviado</span>
                    <span class="is-azul">📍 +20 XP con foto y ubicación</span>
                </div>

                <details class="perfil-xp-detalle">
                    <summary>
                        Ver todas las reglas de XP
                        <span class="perfil-xp-flecha" aria-hidden="true">▾</span>
                    </summary>
                    <div class="perfil-xp-reglas">
                        ${REGLAS_XP.map((regla) => `
                            <span>
                                <b>${regla.icono} +${regla.puntos} XP</b>
                                ${escapar(regla.texto)}
                            </span>`).join("")}
                    </div>
                </details>
            </section>`;
    }

    /**
     * Construye las métricas, la efectividad y el contenedor del historial.
     *
     * @returns {string} HTML del cuadro.
     */
    function htmlResumen() {
        return `
            <section class="perfil-resumen" data-perfil-resumen aria-labelledby="perfilResumenTitulo">
                <div class="perfil-resumen-cabecera">
                    <div>
                        <span class="perfil-resumen-eyebrow">Historial de actividad</span>
                        <h4 id="perfilResumenTitulo">Tus reportes</h4>
                    </div>
                    <button class="perfil-ver-todos" type="button"
                            data-perfil-tab="resumen" aria-pressed="true">
                        Ver todos
                        <strong data-perfil-count="total">0</strong>
                    </button>
                </div>

                <p class="perfil-resumen-ayuda">Toca una tarjeta para filtrar el historial</p>

                <div class="perfil-kpis">
                    <button class="perfil-kpi is-pendiente" type="button"
                            data-perfil-tab="pendiente" aria-pressed="false">
                        <span class="perfil-kpi-icono" aria-hidden="true">🕓</span>
                        <strong data-perfil-count="pendientes">0</strong>
                        <span class="perfil-kpi-label">Pendientes</span>
                    </button>
                    <button class="perfil-kpi is-proceso" type="button"
                            data-perfil-tab="en proceso" aria-pressed="false">
                        <span class="perfil-kpi-icono" aria-hidden="true">🚛</span>
                        <strong data-perfil-count="en_proceso">0</strong>
                        <span class="perfil-kpi-label">En proceso</span>
                    </button>
                    <button class="perfil-kpi is-completado" type="button"
                            data-perfil-tab="completado" aria-pressed="false">
                        <span class="perfil-kpi-icono" aria-hidden="true">✅</span>
                        <strong data-perfil-count="completados">0</strong>
                        <span class="perfil-kpi-label">Completados</span>
                    </button>
                </div>

                <div class="perfil-efectividad">
                    <div class="perfil-efectividad-cabecera">
                        <span>Índice de efectividad</span>
                        <strong><span data-perfil-efectividad>0</span>%</strong>
                    </div>
                    <div class="perfil-efectividad-barra" data-perfil-efectividad-barra
                         role="progressbar" aria-label="Índice de efectividad"
                         aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                        <span data-perfil-efectividad-fill></span>
                    </div>
                    <p data-perfil-efectividad-texto>0 de 0 reportes completados</p>
                </div>

                <div class="perfil-resumen-panel" data-perfil-panel role="tabpanel">
                    <div class="perfil-resumen-cargando">
                        <span class="perfil-spinner" aria-hidden="true"></span>
                        Cargando tus reportes…
                    </div>
                </div>
            </section>`;
    }

    /**
     * Construye la credencial con los datos de la cuenta.
     *
     * @param {Array<{etiqueta: string, valor: *, icono?: string}>} detalles - Filas de detalle.
     * @returns {string} HTML de la sección.
     */
    function htmlDetalles(detalles) {
        const filas = (detalles || [])
            .filter((detalle) => detalle && detalle.etiqueta)
            .map((detalle) => `
                <div class="perfil-dato">
                    <span class="perfil-dato-icono" aria-hidden="true">${escapar(iconoDetalle(detalle.etiqueta, detalle.icono))}</span>
                    <div class="perfil-dato-texto">
                        <span class="perfil-dato-label">${escapar(detalle.etiqueta)}</span>
                        <strong class="perfil-dato-valor">${escapar(detalle.valor)}</strong>
                    </div>
                </div>`)
            .join("");

        if (!filas) return "";

        return `
            <section class="perfil-datos" aria-label="Credencial de tu cuenta">
                <div class="perfil-datos-cabecera">
                    <span class="perfil-datos-icono" aria-hidden="true">🪪</span>
                    <strong>Tu credencial RunTrash</strong>
                    <span class="perfil-datos-estado">Activo</span>
                </div>
                <div class="perfil-datos-grid">${filas}</div>
            </section>`;
    }

    /**
     * Construye la guía didáctica del rol.
     *
     * @param {{emoji: string, etiqueta: string, pasos: string[], clase: string}} rol - Rol resuelto.
     * @returns {string} HTML de la guía.
     */
    function htmlGuia(rol) {
        return `
            <section class="perfil-guia perfil-rol-${escapar(rol.clase)}" aria-label="Guía de tu rol">
                <div class="perfil-guia-cabecera">
                    <span class="perfil-guia-emoji" aria-hidden="true">${escapar(rol.emoji)}</span>
                    <div>
                        <strong>Tu rol en 3 pasos</strong>
                        <span>${escapar(rol.etiqueta)} · guía rápida</span>
                    </div>
                </div>
                <ol class="perfil-guia-pasos">
                    ${rol.pasos.map((paso, indice) => `
                        <li>
                            <span class="perfil-guia-numero" aria-hidden="true">${indice + 1}</span>
                            <span>${escapar(paso)}</span>
                        </li>`).join("")}
                </ol>
            </section>`;
    }

    /**
     * Construye la cabecera de identidad, la gamificación y las secciones
     * del perfil.
     *
     * @param {object} opciones - Configuración del perfil.
     * @param {object|null} opciones.usuario - Usuario autenticado.
     * @param {string|object} [opciones.rol] - Clave del rol o metadatos visuales.
     * @param {Array<{etiqueta: string, valor: *, icono?: string}>} [opciones.detalles] - Filas de detalle.
     * @param {string} [opciones.inicial] - Inicial del avatar; si falta se usa el nombre.
     * @param {string} [opciones.nombreDefecto] - Nombre si el usuario no lo trae.
     * @param {string} [opciones.correoDefecto] - Correo si el usuario no lo trae.
     * @param {string} [opciones.pie] - HTML del pie (botón o enlace de cierre).
     * @param {boolean} [opciones.mostrarResumen=true] - Incluir el cuadro de reportes.
     * @param {boolean} [opciones.mostrarGuia=true] - Incluir la guía del rol.
     * @returns {string} HTML listo para insertar.
     */
    function construir(opciones = {}) {
        const {
            usuario = null,
            rol: rolExplicito = "",
            detalles = [],
            inicial = "",
            nombreDefecto = "Usuario",
            correoDefecto = "Correo no disponible",
            pie = "",
            mostrarResumen = true,
            mostrarGuia = true
        } = opciones;

        const nombre = usuario?.nombre || nombreDefecto;
        const correo = usuario?.correo || correoDefecto;
        const rol = resolverRol(rolExplicito, usuario);
        const mostrarNivel = claveRol(rolExplicito, usuario) === "ciudadano";
        const cuerpoDetalles = htmlDetalles(detalles);
        const bloquePie = pie ? `<div class="perfil-pie">${pie}</div>` : "";

        return `
            <div class="perfil-v2" data-perfil>
                ${htmlHero(usuario, rol, nombre, correo, inicial, mostrarNivel)}
                <div class="perfil-cuerpo${mostrarNivel ? " perfil-cuerpo--xp" : ""}">
                    ${mostrarNivel ? htmlXP() : ""}
                    ${mostrarResumen ? htmlResumen() : ""}
                    ${mostrarGuia ? htmlGuia(rol) : ""}
                    ${cuerpoDetalles}
                    ${bloquePie}
                </div>
            </div>`;
    }

    /**
     * Devuelve los reportes de un estado concreto.
     *
     * @param {object} resumen - Resumen recibido de la API.
     * @param {string} estado - Estado solicitado.
     * @returns {object[]} Reportes.
     */
    function reportesDe(resumen, estado) {
        return (resumen?.reportes || []).filter(
            (reporte) => reporte.estado === estado
        );
    }

    /**
     * Ordena por fecha descendente y limita la cantidad.
     *
     * @param {object[]} reportes - Reportes.
     * @param {number} [limite=6] - Máximo.
     * @returns {object[]} Reportes recientes.
     */
    function recientes(reportes, limite = 6) {
        return [...reportes]
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, limite);
    }

    /**
     * HTML de una tarjeta del historial.
     *
     * @param {object} reporte - Reporte.
     * @returns {string} HTML de la tarjeta.
     */
    function htmlReporte(reporte) {
        const arte = ilustracion(reporte.tipo);
        const tipo = escapar(reporte.tipo || "Reporte");
        const titulo = escapar(reporte.descripcion || reporte.tipo || "Reporte");
        const localidad = escapar(reporte.localidad || "Sin localidad");
        const ubicacion = String(reporte.ubicacion || "").trim();
        const lugar = ubicacion && ubicacion !== "Sin ubicación" && ubicacion !== localidad
            ? `${localidad} · ${escapar(ubicacion)}`
            : localidad;

        return `
            <article class="perfil-reporte">
                <span class="perfil-reporte-icono is-${arte.clase}" aria-hidden="true">${arte.icono}</span>
                <div class="perfil-reporte-info">
                    <div class="perfil-reporte-fila">
                        <div class="perfil-reporte-titulos">
                            <span class="perfil-reporte-categoria">${tipo}</span>
                            <strong class="perfil-reporte-titulo">${titulo}</strong>
                        </div>
                        <span class="perfil-reporte-estado status ${claseEstado(reporte.estado)}">${escapar(textoEstado(reporte.estado))}</span>
                    </div>
                    <p class="perfil-reporte-meta">
                        <span><span aria-hidden="true">🕒</span> ${escapar(fechaBonita(reporte.fecha))}</span>
                        <span><span aria-hidden="true">📍</span> ${lugar}</span>
                    </p>
                </div>
            </article>`;
    }

    /**
     * HTML de la lista de reportes de un filtro.
     *
     * @param {object} resumen - Resumen recibido.
     * @param {string} estado - Estado o `resumen`.
     * @returns {string} HTML de la lista.
     */
    function htmlLista(resumen, estado) {
        const items = estado === "resumen"
            ? recientes(resumen?.reportes || [])
            : recientes(reportesDe(resumen, estado));
        const titulo = estado === "resumen"
            ? "Últimos movimientos"
            : ETIQUETAS[estado];
        const contadores = {
            resumen: "total",
            pendiente: "pendientes",
            "en proceso": "en_proceso",
            completado: "completados"
        };
        const total = Number(resumen?.[contadores[estado]] || 0);
        const resumenTexto = items.length < total
            ? `${items.length} de ${total}`
            : `${items.length} ${items.length === 1 ? "reporte" : "reportes"}`;

        if (!items.length) {
            return `
                <div class="perfil-resumen-vacio">
                    <span aria-hidden="true">${estado === "completado" ? "🌱" : "📭"}</span>
                    <strong>Sin reportes ${estado === "resumen" ? "" : ETIQUETAS[estado].toLowerCase()}</strong>
                    <p>${estado === "resumen"
                        ? "Cuando registres un reporte aparecerá aquí con su estado."
                        : "No hay reportes en este estado por ahora."}</p>
                </div>`;
        }

        return `
            <div class="perfil-lista-cabecera">
                <strong>${titulo}</strong>
                <span>${resumenTexto}</span>
            </div>
            <div class="perfil-lista">${items.map(htmlReporte).join("")}</div>`;
    }

    /**
     * Sincroniza la insignia de nivel, el globo del avatar y la barra de XP.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @param {object} estado - Estado interno.
     * @returns {void}
     */
    function pintarXP(contenido, estado) {
        const tarjeta = contenido.querySelector("[data-perfil-xp]");
        if (!tarjeta) return;

        const totalXP = Number(estado.resumen?.xp?.total || 0);
        const datos = datosNivel(totalXP);

        const insignia = contenido.querySelector("[data-perfil-nivel]");
        if (insignia) {
            insignia.textContent = `Nivel ${datos.nivel} - ${datos.titulo} ${datos.emoji}`;
        }

        const globo = contenido.querySelector("[data-perfil-avatar-nivel]");
        if (globo) {
            globo.textContent = datos.nivel > 20 ? "20+" : String(datos.nivel);
        }

        /**
         * Escribe el texto de un nodo si existe.
         *
         * @param {string} selector - Selector dentro de la tarjeta.
         * @param {string} valor - Texto formateado.
         * @returns {void}
         */
        const escribir = (selector, valor) => {
            const nodo = tarjeta.querySelector(selector);
            if (nodo) nodo.textContent = valor;
        };

        escribir("[data-perfil-xp-actual]", formatoXP.format(datos.xpEnNivel));
        escribir("[data-perfil-xp-meta]", formatoXP.format(datos.xpNecesario));
        escribir("[data-perfil-xp-total]", formatoXP.format(totalXP));
        escribir(
            "[data-perfil-xp-falta]",
            `Te faltan ${formatoXP.format(datos.xpNecesario - datos.xpEnNivel)} XP para el Nivel ${datos.nivel + 1}`
        );
        escribir("[data-perfil-xp-objetivo]", `Siguiente objetivo: Nivel ${datos.nivel + 1}`);

        const barra = tarjeta.querySelector("[data-perfil-xp-barra]");
        const relleno = tarjeta.querySelector("[data-perfil-xp-fill]");

        if (relleno) relleno.style.width = `${datos.porcentaje}%`;
        if (barra) {
            barra.setAttribute("aria-valuemax", String(datos.xpNecesario));
            barra.setAttribute("aria-valuenow", String(datos.xpEnNivel));
            barra.setAttribute(
                "aria-valuetext",
                `${datos.porcentaje}% hacia el Nivel ${datos.nivel + 1}`
            );
        }
    }

    /**
     * Repinta el panel y sincroniza contadores, efectividad y filtros.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @param {object} estado - Estado interno.
     * @returns {void}
     */
    function pintarPanel(contenido, estado) {
        const panel = contenido.querySelector("[data-perfil-panel]");
        const resumen = estado.resumen;

        pintarXP(contenido, estado);

        if (!panel) return;

        if (!resumen) {
            panel.innerHTML = `
                <div class="perfil-resumen-vacio">
                    <span aria-hidden="true">📡</span>
                    <strong>No se pudo cargar el resumen</strong>
                    <p>Vuelve a abrir tu perfil en unos segundos.</p>
                </div>`;
            return;
        }

        const contadores = {
            total: resumen.total,
            pendientes: resumen.pendientes,
            en_proceso: resumen.en_proceso,
            completados: resumen.completados
        };

        contenido.querySelectorAll("[data-perfil-count]").forEach((nodo) => {
            const clave = nodo.dataset.perfilCount;
            if (clave in contadores) {
                nodo.textContent = String(Number(contadores[clave] || 0));
            }
        });

        const total = Number(resumen.total || 0);
        const completados = Number(resumen.completados || 0);
        const efectividad = total > 0
            ? Math.round((completados / total) * 100)
            : 0;

        const porcentaje = contenido.querySelector("[data-perfil-efectividad]");
        if (porcentaje) porcentaje.textContent = String(efectividad);

        const texto = contenido.querySelector("[data-perfil-efectividad-texto]");
        if (texto) {
            texto.textContent = `${completados} de ${total} reportes completados`;
        }

        const barra = contenido.querySelector("[data-perfil-efectividad-barra]");
        const relleno = contenido.querySelector("[data-perfil-efectividad-fill]");

        if (relleno) relleno.style.width = `${efectividad}%`;
        if (barra) barra.setAttribute("aria-valuenow", String(efectividad));

        contenido.querySelectorAll("[data-perfil-tab]").forEach((boton) => {
            const activo = (boton.dataset.perfilTab || "resumen") === estado.tab;
            boton.classList.toggle("is-active", activo);
            boton.setAttribute("aria-pressed", String(activo));
        });

        panel.innerHTML = htmlLista(resumen, estado.tab);
    }

    /**
     * Actualiza la foto visible y el botón de quitarla.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @param {object} estado - Estado interno.
     * @returns {void}
     */
    function pintarAvatar(contenido, estado) {
        const boton = contenido.querySelector("[data-perfil-foto]");
        if (!boton) return;

        const foto = avatarSeguro(estado.usuario?.avatar_url);
        const letra = String(
            estado.inicial || estado.usuario?.nombre || "U"
        ).charAt(0).toUpperCase();

        boton.classList.toggle("tiene-foto", Boolean(foto));
        boton.innerHTML = `
            ${foto
                ? `<img src="${escapar(foto)}" alt="Foto de perfil">`
                : `<span>${escapar(letra)}</span>`}
            <span class="perfil-avatar-cam" aria-hidden="true">📷</span>`;

        const quitar = contenido.querySelector("[data-perfil-quitar-foto]");
        if (quitar) quitar.hidden = !foto;
    }

    /**
     * Guarda el avatar en `localStorage` para que sobreviva a la recarga.
     *
     * @param {object} usuario - Usuario con `avatar_url`.
     * @returns {void}
     */
    function guardarUsuarioLocal(usuario) {
        try {
            const actual = JSON.parse(
                localStorage.getItem("runtrash_user") || "{}"
            );

            localStorage.setItem("runtrash_user", JSON.stringify({
                ...actual,
                avatar_url: avatarSeguro(usuario?.avatar_url) || null
            }));
        } catch (error) {
            /* Sin localStorage la foto sigue visible en esta sesión. */
        }
    }

    /**
     * Envía el avatar al servidor y actualiza la interfaz.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @param {object} estado - Estado interno.
     * @param {string|null} avatar - Data URL o `null`.
     * @returns {Promise<void>}
     */
    async function guardarAvatar(contenido, estado, avatar) {
        if (estado.guardando) return;
        estado.guardando = true;

        const boton = contenido.querySelector("[data-perfil-foto]");
        boton?.classList.add("is-loading");

        try {
            const respuesta = await fetch(`${baseApi()}/api/perfil/avatar`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${tokenActual()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ avatar })
            });
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(datos.mensaje || "No se pudo guardar la foto.");
            }

            if (estado.usuario) {
                estado.usuario.avatar_url = datos.avatar || null;
            }

            guardarUsuarioLocal(estado.usuario);
            pintarAvatar(contenido, estado);
            pintarAvatarGlobal(datos.avatar);
            avisar(datos.mensaje || "Foto actualizada.");
        } catch (error) {
            avisar(error.message || "No se pudo guardar la foto.");
        } finally {
            estado.guardando = false;
            boton?.classList.remove("is-loading");
        }
    }

    /**
     * Recorta la imagen al centro en un cuadrado y la reduce.
     *
     * @param {File} archivo - Archivo elegido.
     * @returns {Promise<string>} Data URL WEBP (o JPEG si el navegador no lo soporta).
     */
    function procesarImagen(archivo) {
        return new Promise((resolve, reject) => {
            if (!FORMATOS.has(archivo.type)) {
                reject(new Error("Elige una imagen PNG, JPG o WEBP."));
                return;
            }

            if (archivo.size > PESO_MAXIMO) {
                reject(new Error("La imagen supera los 8 MB."));
                return;
            }

            const url = URL.createObjectURL(archivo);
            const imagen = new Image();

            imagen.onload = () => {
                try {
                    const lado = Math.min(imagen.width, imagen.height);
                    const x = (imagen.width - lado) / 2;
                    const y = (imagen.height - lado) / 2;
                    const lienzo = document.createElement("canvas");
                    lienzo.width = LADO_AVATAR;
                    lienzo.height = LADO_AVATAR;

                    const contexto = lienzo.getContext("2d");
                    contexto.drawImage(
                        imagen,
                        x,
                        y,
                        lado,
                        lado,
                        0,
                        0,
                        LADO_AVATAR,
                        LADO_AVATAR
                    );

                    let datos = lienzo.toDataURL("image/webp", 0.85);
                    if (!datos.startsWith("data:image/webp")) {
                        datos = lienzo.toDataURL("image/jpeg", 0.85);
                    }

                    resolve(datos);
                } catch (error) {
                    reject(new Error("No se pudo procesar la imagen."));
                } finally {
                    URL.revokeObjectURL(url);
                }
            };

            imagen.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("No se pudo leer la imagen."));
            };

            imagen.src = url;
        });
    }

    /**
     * Carga el resumen de reportes del usuario autenticado.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @param {object} estado - Estado interno.
     * @returns {Promise<void>}
     */
    async function cargarResumen(contenido, estado) {
        const token = tokenActual();

        if (!token || !estado.usuario?.id) {
            estado.resumen = {
                total: 0,
                pendientes: 0,
                en_proceso: 0,
                completados: 0,
                reportes: []
            };
            pintarPanel(contenido, estado);
            return;
        }

        try {
            const respuesta = await fetch(`${baseApi()}/api/perfil/resumen`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const datos = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(datos.mensaje || "No se pudo cargar el resumen.");
            }

            estado.resumen = datos.resumen;
            estado.usuario.avatar_url = datos.avatar || null;
            guardarUsuarioLocal(estado.usuario);
            pintarAvatar(contenido, estado);
            pintarAvatarGlobal(datos.avatar);
            pintarPanel(contenido, estado);
        } catch (error) {
            estado.resumen = null;
            pintarPanel(contenido, estado);
        }
    }

    /**
     * Maneja los clics dentro del contenido del perfil.
     *
     * @param {MouseEvent} evento - Evento delegado.
     * @returns {void}
     */
    function manejarClick(evento) {
        const contenido = evento.currentTarget;
        const estado = estados.get(contenido);
        if (!estado) return;

        if (evento.target.closest("[data-perfil-cerrar]")) {
            const tarjeta = contenido.closest(".modal-card");
            const cerrar = tarjeta?.querySelector(
                ".modal-header .close, .modal-header .close-modal"
            );

            if (cerrar) {
                cerrar.click();
            } else {
                contenido.closest(".modal")?.classList.remove("show");
            }

            return;
        }

        const pestaña = evento.target.closest("[data-perfil-tab]");
        if (pestaña) {
            const clave = pestaña.dataset.perfilTab || "resumen";
            estado.tab = clave !== "resumen" && estado.tab === clave
                ? "resumen"
                : clave;
            pintarPanel(contenido, estado);
            return;
        }

        if (evento.target.closest("[data-perfil-quitar-foto]")) {
            guardarAvatar(contenido, estado, null);
            return;
        }

        if (evento.target.closest("[data-perfil-foto]")) {
            contenido.querySelector("[data-perfil-input]")?.click();
        }
    }

    /**
     * Maneja la selección de una foto nueva.
     *
     * @param {Event} evento - Evento `change`.
     * @returns {Promise<void>}
     */
    async function manejarCambio(evento) {
        const contenido = evento.currentTarget;
        const estado = estados.get(contenido);
        const input = evento.target.closest("[data-perfil-input]");
        if (!estado || !input) return;

        const archivo = input.files?.[0];
        input.value = "";

        if (!archivo) return;

        try {
            const avatar = await procesarImagen(archivo);
            await guardarAvatar(contenido, estado, avatar);
        } catch (error) {
            avisar(error.message);
        }
    }

    /**
     * Prepara los eventos una sola vez por contenedor.
     *
     * @param {HTMLElement} contenido - Contenedor del modal.
     * @returns {void}
     */
    function prepararEventos(contenido) {
        if (contenido.dataset.perfilEventos === "1") return;

        contenido.dataset.perfilEventos = "1";
        contenido.addEventListener("click", manejarClick);
        contenido.addEventListener("change", manejarCambio);
    }

    /**
     * Abre un modal con el perfil ya construido.
     *
     * @param {object} opciones - Configuración del modal.
     * @param {string} opciones.titulo - Título del modal.
     * @param {string} opciones.tituloId - Id del elemento de título.
     * @param {string} opciones.contenidoId - Id del contenedor del contenido.
     * @param {string} opciones.modalId - Id del modal.
     * @param {object|null} opciones.usuario - Usuario autenticado.
     * @param {string|object} [opciones.rol] - Clave del rol o metadatos visuales.
     * @param {Array<{etiqueta: string, valor: *, icono?: string}>} [opciones.detalles] - Filas de detalle.
     * @param {string} [opciones.inicial] - Inicial del avatar.
     * @param {string} [opciones.nombreDefecto] - Nombre por defecto.
     * @param {string} [opciones.correoDefecto] - Correo por defecto.
     * @param {string} [opciones.pie] - HTML del pie.
     * @param {boolean} [opciones.mostrarResumen=true] - Incluir el cuadro de reportes.
     * @param {boolean} [opciones.mostrarGuia=true] - Incluir la guía del rol.
     * @returns {void}
     */
    function abrir(opciones) {
        const {
            titulo,
            tituloId,
            contenidoId,
            modalId,
            ...perfil
        } = opciones;

        const tituloEl = document.getElementById(tituloId);
        if (tituloEl && titulo) tituloEl.textContent = titulo;

        const contenido = document.getElementById(contenidoId);
        const modal = document.getElementById(modalId);

        if (contenido) {
            contenido.innerHTML = construir(perfil);
            prepararEventos(contenido);

            estados.set(contenido, {
                usuario: perfil.usuario || null,
                inicial: perfil.inicial || "",
                resumen: null,
                tab: "resumen",
                guardando: false
            });

            const tarjeta = contenido.closest(".modal-card");
            tarjeta?.classList.add("profile-modal-card");

            /*
            La misma tarjeta se reutiliza para otros modales de la
            página. Cuando el modal se cierra, por el motivo que sea, se
            quita la clase ancha para no afectar al resto.
            */
            if (modal && modal.dataset.perfilObservado !== "1") {
                modal.dataset.perfilObservado = "1";

                new MutationObserver(() => {
                    if (!modal.classList.contains("show")) {
                        modal.querySelector(".modal-card")
                            ?.classList.remove("profile-modal-card");
                    }
                }).observe(modal, {
                    attributes: true,
                    attributeFilter: ["class"]
                });
            }

            if (perfil.mostrarResumen !== false) {
                cargarResumen(contenido, estados.get(contenido));
            }
        }

        modal?.classList.add("show");
    }

    window.RunTrashPerfil = Object.freeze({
        construir,
        abrir,
        pintarAvatarGlobal
    });

    iniciarAvatarGlobal();
})();
