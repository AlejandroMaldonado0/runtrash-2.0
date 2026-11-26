/**
 * @file Localidad de Bogotá a partir de coordenadas (servidor).
 *
 * El formulario del ciudadano ya no permite elegir la localidad: la
 * asigna el GPS. Para que esa regla no se pueda saltar llamando a la
 * API directamente, la ruta de creación de reportes recalcula la
 * localidad aquí, con los mismos polígonos que usa el navegador.
 *
 * @module lib/geolocalizacion
 */

const fs = require('node:fs');
const path = require('node:path');

/*
Se reutiliza el algoritmo del frontend para que ambos lados resuelvan
exactamente igual. El módulo no toca `fetch` hasta que se llama a
`detectar`, y aquí solo se usan las funciones puras.
*/
const { preparar, detectarEn } = require('../../frontend/pages/ciudadano/localidades.js');

/** Ruta del dataset compartido con el navegador. */
const RUTA_DATOS = path.resolve(__dirname, '..', '..', 'frontend', 'data', 'localidades-bogota.json');

/** Localidades preparadas con caja envolvente. @type {Array<object>|null} */
let localidades = null;

/**
 * Convierte un campo de coordenadas en número.
 *
 * Un valor vacío cuenta como ausente (`null`), no como cero.
 *
 * @param {*} valor - Valor recibido en `req.body`.
 * @returns {number|null} Coordenada o `null`.
 */
function leerCoordenada(valor) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
        return null;
    }

    return Number(valor);
}

/**
 * Carga los polígonos una sola vez y los deja en caché.
 *
 * @returns {Array<object>} Localidades preparadas.
 */
function cargar() {
    if (!localidades) {
        const datos = JSON.parse(fs.readFileSync(RUTA_DATOS, 'utf8'));
        localidades = preparar(datos);
    }

    return localidades;
}

/**
 * Devuelve la localidad de Bogotá que contiene el punto.
 *
 * @param {number} lat - Latitud.
 * @param {number} lon - Longitud.
 * @returns {string|null} Nombre de la localidad o `null` si el punto
 *   no está dentro del perímetro distrital.
 */
function detectarLocalidad(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return detectarEn(lat, lon, cargar());
}

/**
 * Valida las coordenadas y calcula la localidad que se guardará.
 *
 * Devuelve el mensaje listo para responder al cliente cuando algo
 * falta o no es válido, de modo que la ruta no repita las reglas.
 *
 * @param {{latitud?: *, longitud?: *}} coordenadas - Campos del formulario.
 * @returns {{ok: true, latitud: number, longitud: number, localidad: string}
 *   | {ok: false, mensaje: string}} Resultado.
 */
function resolverLocalidad({ latitud, longitud }) {
    const latitudFinal = leerCoordenada(latitud);
    const longitudFinal = leerCoordenada(longitud);

    if (latitudFinal === null || longitudFinal === null) {
        return {
            ok: false,
            mensaje: 'Activa la ubicación GPS para asignar la localidad del reporte.'
        };
    }

    const invalidas =
        !Number.isFinite(latitudFinal) || latitudFinal < -90 || latitudFinal > 90
        || !Number.isFinite(longitudFinal) || longitudFinal < -180 || longitudFinal > 180;

    if (invalidas) {
        return {
            ok: false,
            mensaje: 'Las coordenadas GPS no son válidas.'
        };
    }

    const localidad = detectarLocalidad(latitudFinal, longitudFinal);

    if (!localidad) {
        return {
            ok: false,
            mensaje: 'Tu ubicación no está dentro de Bogotá. Activa el GPS nuevamente.'
        };
    }

    return {
        ok: true,
        latitud: latitudFinal,
        longitud: longitudFinal,
        localidad
    };
}

module.exports = {
    detectarLocalidad,
    leerCoordenada,
    resolverLocalidad
};
