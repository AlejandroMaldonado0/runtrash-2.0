/**
 * @file Detección de la localidad de Bogotá a partir de coordenadas.
 *
 * El formulario del ciudadano activa el GPS al abrirse; con la latitud
 * y la longitud se busca en qué localidad cae el punto para
 * seleccionarla automáticamente.
 *
 * Los polígonos viven en `frontend/data/localidades-bogota.json`
 * (34 KB simplificados) y se descargan una sola vez, solo cuando se
 * necesitan. Si la descarga falla, el formulario sigue funcionando y
 * el ciudadano elige la localidad a mano.
 *
 * Expone `window.LocalidadesBogota` con `detectar(lat, lon)`.
 *
 * @module frontend/pages/ciudadano/localidades
 */
(function (raiz) {
    "use strict";

    /** Ruta pública del dataset (servida por `express.static`). */
    const RUTA_DATOS = "/frontend/data/localidades-bogota.json";

    /*
    Caja envolvente de Bogotá (incluye Sumapaz). Sirve para descartar
    coordenadas de otras ciudades antes de recorrer los polígonos.
    */
    const LIMITES_BOGOTA = {
        minLat: 3.7,
        maxLat: 4.9,
        minLon: -74.5,
        maxLon: -73.9
    };

    /** Localidades ya preparadas con su caja envolvente. @type {Array<object>|null} */
    let localidades = null;

    /** Descarga en curso, para no pedir el JSON dos veces. @type {Promise<Array<object>>|null} */
    let descarga = null;

    /**
     * Calcula la caja envolvente de todos los anillos de una localidad.
     *
     * @param {Array<Array<[number, number]>>} anillos - Anillos [lon, lat].
     * @returns {[number, number, number, number]} `[minLon, minLat, maxLon, maxLat]`.
     */
    function cajaEnvolvente(anillos) {
        let minLon = Infinity;
        let minLat = Infinity;
        let maxLon = -Infinity;
        let maxLat = -Infinity;

        for (const anillo of anillos) {
            for (const [lon, lat] of anillo) {
                if (lon < minLon) minLon = lon;
                if (lat < minLat) minLat = lat;
                if (lon > maxLon) maxLon = lon;
                if (lat > maxLat) maxLat = lat;
            }
        }

        return [minLon, minLat, maxLon, maxLat];
    }

    /**
     * Convierte el JSON descargado en una lista lista para consultar.
     *
     * @param {object} json - Contenido de `localidades-bogota.json`.
     * @returns {Array<{nombre: string, anillos: Array, bbox: number[]}>} Localidades.
     */
    function preparar(json) {
        const mapa = (json && json.localidades) || {};

        return Object.entries(mapa).map(([nombre, anillos]) => ({
            nombre,
            anillos,
            bbox: cajaEnvolvente(anillos)
        }));
    }

    /**
     * Comprueba si un punto está dentro de un anillo (ray casting).
     *
     * @param {number} lon - Longitud.
     * @param {number} lat - Latitud.
     * @param {Array<[number, number]>} anillo - Vértices [lon, lat].
     * @returns {boolean} `true` si el punto cae dentro.
     */
    function dentroDeAnillo(lon, lat, anillo) {
        let dentro = false;

        for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
            const [xi, yi] = anillo[i];
            const [xj, yj] = anillo[j];
            const cruza = (yi > lat) !== (yj > lat);
            if (cruza && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
                dentro = !dentro;
            }
        }

        return dentro;
    }

    /**
     * Indica si el punto pertenece a la localidad. Recorre todos los
     * anillos con la regla par-impar, así los huecos quedan excluidos.
     *
     * @param {{anillos: Array<Array<[number, number]>>}} localidad - Localidad.
     * @param {number} lon - Longitud.
     * @param {number} lat - Latitud.
     * @returns {boolean} `true` si el punto está dentro.
     */
    function contiene(localidad, lon, lat) {
        let dentro = false;

        for (const anillo of localidad.anillos) {
            if (dentroDeAnillo(lon, lat, anillo)) dentro = !dentro;
        }

        return dentro;
    }

    /**
     * Busca la localidad de un punto en una lista ya preparada.
     *
     * @param {number} lat - Latitud.
     * @param {number} lon - Longitud.
     * @param {Array<object>} lista - Resultado de `preparar`.
     * @returns {string|null} Nombre de la localidad o `null`.
     */
    function detectarEn(lat, lon, lista) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        for (const localidad of lista) {
            const [minLon, minLat, maxLon, maxLat] = localidad.bbox;
            if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
            if (contiene(localidad, lon, lat)) return localidad.nombre;
        }

        return null;
    }

    /**
     * Descarga (una sola vez) y prepara los polígonos.
     *
     * @returns {Promise<Array<object>>} Localidades listas para consultar.
     */
    function cargar() {
        if (localidades) return Promise.resolve(localidades);

        if (!descarga) {
            descarga = fetch(RUTA_DATOS, { credentials: "same-origin" })
                .then((respuesta) => {
                    if (!respuesta.ok) {
                        throw new Error(`No se pudieron cargar las localidades (${respuesta.status}).`);
                    }
                    return respuesta.json();
                })
                .then((json) => {
                    localidades = preparar(json);
                    return localidades;
                })
                .catch((error) => {
                    /* Permite reintentar en el siguiente intento de GPS. */
                    descarga = null;
                    throw error;
                });
        }

        return descarga;
    }

    /**
     * Devuelve la localidad de Bogotá que contiene el punto.
     *
     * Descarta coordenadas fuera del perímetro distrital sin recorrer
     * los polígonos.
     *
     * @param {number} lat - Latitud.
     * @param {number} lon - Longitud.
     * @returns {Promise<string|null>} Localidad detectada o `null`.
     */
    async function detectar(lat, lon) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        if (
            lat < LIMITES_BOGOTA.minLat || lat > LIMITES_BOGOTA.maxLat ||
            lon < LIMITES_BOGOTA.minLon || lon > LIMITES_BOGOTA.maxLon
        ) {
            return null;
        }

        const lista = await cargar();
        return detectarEn(lat, lon, lista);
    }

    const modulo = {
        RUTA_DATOS,
        cargar,
        detectar,
        detectarEn,
        preparar
    };

    if (typeof module === "object" && module.exports) {
        module.exports = modulo;
    } else {
        raiz.LocalidadesBogota = modulo;
    }
})(typeof window !== "undefined" ? window : globalThis);
