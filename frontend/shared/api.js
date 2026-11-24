/**
 * @file Resolución de la URL base de la API.
 *
 * Centraliza la lógica que antes se repetía en cada página:
 *   1. `?api=https://servidor...` (pruebas manuales)
 *   2. `window.RUNTRASH_API` (config.js)
 *   3. mismo origen
 *   4. `localhost:3000` al abrir el archivo con doble clic
 *
 * Expone `window.RunTrashAPI` con la base y helpers de sesión.
 *
 * @module frontend/shared/api
 */
(() => {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const base = (
        params.get("api")
        || window.RUNTRASH_API
        || (window.location.protocol === "file:" ? "http://localhost:3000" : "")
        || window.location.origin
    ).replace(/\/+$/, "");

    /**
     * Devuelve el token guardado en el navegador.
     * @returns {string} Token o cadena vacía.
     */
    function token() {
        return localStorage.getItem("runtrash_token") || "";
    }

    /**
     * Construye el encabezado Authorization si hay sesión.
     * @returns {Record<string, string>} Encabezados de autenticación.
     */
    function authorization() {
        const actual = token();
        return actual ? { Authorization: `Bearer ${actual}` } : {};
    }

    /**
     * Ejecuta una petición a la API con el token actual.
     *
     * @param {string} path - Ruta relativa, por ejemplo `/api/reportes`.
     * @param {RequestInit} [options] - Opciones de fetch.
     * @returns {Promise<Response>} Respuesta HTTP.
     */
    async function request(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const actual = token();

        if (actual) headers.set("Authorization", `Bearer ${actual}`);
        if (options.body
            && !(options.body instanceof FormData)
            && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        return fetch(`${base}${path}`, { ...options, headers });
    }

    window.RunTrashAPI = Object.freeze({
        base,
        token,
        authorization,
        request
    });
})();
