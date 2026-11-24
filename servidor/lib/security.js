/**
 * @file Utilidades criptográficas para contraseñas y tokens de sesión.
 *
 * Usa `scrypt` para todas las contraseñas y tokens de sesión. No se
 * aceptan contraseñas en texto plano: las cuentas heredadas se
 * convierten a `scrypt` al arrancar el servidor (véase
 * `lib/mantenimiento.js`).
 *
 * @module lib/security
 */

const crypto = require('node:crypto');

/** Longitud en bytes de la clave derivada con scrypt. */
const SCRYPT_KEY_LENGTH = 64;

/** Longitud mínima de una contraseña nueva. */
const PASSWORD_MIN_LENGTH = 8;

/** Longitud máxima aceptada para evitar abusos de memoria. */
const PASSWORD_MAX_LENGTH = 128;

/**
 * Indica si un valor almacenado tiene el formato de hash `scrypt`.
 *
 * @param {string} storedValue - Valor guardado en `usuarios.password`.
 * @returns {boolean} `true` si es un hash scrypt bien formado.
 */
function esHashPassword(storedValue) {
    return /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(
        String(storedValue ?? '')
    );
}

/**
 * Genera un hash `scrypt$sal$hash` para una contraseña.
 *
 * @param {string} password - Contraseña en texto plano.
 * @param {string} [salt] - Sal hexadecimal; se genera una aleatoria si falta.
 * @returns {string} Hash listo para guardar en la base de datos.
 */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LENGTH);
    return `scrypt$${salt}$${hash.toString('hex')}`;
}

/**
 * Comprueba una contraseña contra el hash almacenado.
 *
 * Solo acepta hashes `scrypt`. Cualquier valor heredado en texto plano
 * se rechaza: esas cuentas deben pasar por el rehash de arranque o por
 * una recuperación de contraseña.
 *
 * @param {string} password - Contraseña ingresada.
 * @param {string} storedValue - Hash guardado en la base de datos.
 * @returns {boolean} `true` si coincide.
 */
function verifyPassword(password, storedValue) {
    if (!esHashPassword(storedValue)) return false;

    const [, salt, expectedHex] = String(storedValue).split('$');
    const expected = Buffer.from(expectedHex, 'hex');

    if (!expected.length || expected.length !== SCRYPT_KEY_LENGTH) {
        return false;
    }

    const actual = crypto.scryptSync(
        String(password),
        salt,
        SCRYPT_KEY_LENGTH
    );

    return actual.length === expected.length
        && crypto.timingSafeEqual(actual, expected);
}

/**
 * Valida la política mínima de contraseñas nuevas.
 *
 * Reglas: entre 8 y 128 caracteres, con al menos una letra y un
 * número. No se exige un símbolo para no empujar a los usuarios a
 * reutilizar patrones predecibles.
 *
 * @param {string} password - Contraseña propuesta.
 * @returns {{ok: boolean, mensaje: string}} Resultado de la validación.
 */
function validarPassword(password) {
    const valor = String(password ?? '');

    if (valor.length < PASSWORD_MIN_LENGTH) {
        return {
            ok: false,
            mensaje: `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres.`
        };
    }

    if (valor.length > PASSWORD_MAX_LENGTH) {
        return {
            ok: false,
            mensaje: `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`
        };
    }

    if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) {
        return {
            ok: false,
            mensaje: 'La contraseña debe incluir al menos una letra y un número.'
        };
    }

    return { ok: true, mensaje: '' };
}

/**
 * Compara dos cadenas en tiempo constante.
 *
 * Se usa para el NIT y el código de operario, que actúan como segundo
 * factor. La longitud se compara primero para evitar excepciones de
 * `timingSafeEqual`.
 *
 * @param {string} valor - Valor ingresado.
 * @param {string} esperado - Valor almacenado.
 * @returns {boolean} `true` si son idénticos.
 */
function compararSeguro(valor, esperado) {
    const actual = Buffer.from(String(valor ?? ''));
    const referencia = Buffer.from(String(esperado ?? ''));

    if (actual.length !== referencia.length) {
        return false;
    }

    return crypto.timingSafeEqual(actual, referencia);
}

/**
 * Deriva el hash SHA-256 con el que se identifica una sesión.
 *
 * @param {string} token - Token opaco entregado al cliente.
 * @returns {string} Hash hexadecimal de 64 caracteres.
 */
function hashSessionToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Genera un código numérico de verificación para un operario.
 *
 * La empresa lo entrega en persona y el operario lo usa junto al código
 * derivado del NIT. Se generan seis dígitos para que sea fácil de dictar
 * sin dejar de tener un millón de combinaciones.
 *
 * @returns {string} Código de seis dígitos con ceros a la izquierda.
 */
function generarCodigoVerificacion() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Comprueba el formato de un código de verificación.
 *
 * @param {string} codigo - Código ingresado por el operario.
 * @returns {boolean} `true` si son exactamente seis dígitos.
 */
function validarFormatoCodigoVerificacion(codigo) {
    return /^\d{6}$/.test(String(codigo ?? '').trim());
}

module.exports = {
    PASSWORD_MIN_LENGTH,
    PASSWORD_MAX_LENGTH,
    esHashPassword,
    hashPassword,
    verifyPassword,
    validarPassword,
    compararSeguro,
    hashSessionToken,
    generarCodigoVerificacion,
    validarFormatoCodigoVerificacion
};
