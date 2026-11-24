/**
 * @file Reglas de negocio del NIT y del código de operario.
 *
 * En RunTrash el código de un operario no se elige libremente: debe
 * coincidir con los últimos cuatro dígitos del NIT de la empresa a la
 * que pertenece. Este módulo centraliza esa derivación para que el
 * registro, la administración y el inicio de sesión apliquen la misma
 * regla.
 *
 * @module lib/nit
 */

const { compararSeguro } = require('./security');

/**
 * Elimina todo lo que no sea dígito (puntos, guiones, espacios).
 *
 * @param {string|number|null|undefined} valor - NIT o código.
 * @returns {string} Cadena compuesta solo por dígitos.
 */
function soloDigitos(valor) {
    return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Normaliza un NIT para compararlo: recorta espacios sin alterar el
 * formato original que la empresa registró.
 *
 * @param {string|number|null|undefined} nit - NIT recibido.
 * @returns {string} NIT sin espacios externos.
 */
function normalizarNit(nit) {
    return String(nit ?? '').trim();
}

/**
 * Deriva el código de operario a partir del NIT de la empresa.
 *
 * Se toman los últimos cuatro dígitos después de descartar puntos,
 * guiones y cualquier otro separador. Ejemplos:
 * - `900123456-7` → `4567`
 * - `123456789`   → `6789`
 *
 * @param {string|number|null|undefined} nit - NIT de la empresa.
 * @returns {string|null} Código de cuatro dígitos o `null` si el NIT
 * no contiene al menos cuatro dígitos.
 */
function codigoOperarioDesdeNit(nit) {
    const digitos = soloDigitos(nit);

    if (digitos.length < 4) return null;

    return digitos.slice(-4);
}

/**
 * Comprueba que un código corresponda al NIT indicado.
 *
 * @param {string|number|null|undefined} codigo - Código ingresado.
 * @param {string|number|null|undefined} nit - NIT de la empresa.
 * @returns {boolean} `true` si el código es el esperado.
 */
function codigoOperarioValido(codigo, nit) {
    const esperado = codigoOperarioDesdeNit(nit);

    return Boolean(esperado)
        && compararSeguro(String(codigo ?? '').trim(), esperado);
}

module.exports = {
    soloDigitos,
    normalizarNit,
    codigoOperarioDesdeNit,
    codigoOperarioValido
};
