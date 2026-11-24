/**
 * @file Utilidades de OAuth 2.0 (Google y Microsoft/Outlook).
 *
 * Implementa el flujo de autorización con PKCE y `state` firmado. El
 * `state` y el `code_verifier` viajan en una cookie HttpOnly de corta
 * duración, nunca en la URL. El servidor intercambia el código por un
 * token y consulta el correo del usuario; la sesión de RunTrash se
 * crea solo para cuentas ya registradas y activas.
 *
 * @module lib/oauth
 */

const crypto = require('node:crypto');
const { compararSeguro } = require('./security');
const { oauthBaseUrl, oauthProviders, oauthDemo } = require('../config');

/** Minutos de validez de la cookie de autorización. */
const MINUTOS_ESTADO = 10;

/** Nombre de la cookie que guarda `state` y `code_verifier`. */
const PREFIJO_COOKIE = 'runtrash_oauth_';

/**
 * Secreto usado para firmar el `state`. Si no se define en el entorno
 * se genera uno aleatorio por proceso: las autorizaciones en curso se
 * invalidan al reiniciar, que es un comportamiento seguro.
 */
const SECRETO_ESTADO = String(
    process.env.OAUTH_STATE_SECRET || crypto.randomBytes(32).toString('hex')
);

/**
 * Codifica un Buffer o cadena en base64url sin relleno.
 *
 * @param {Buffer|string} valor - Contenido a codificar.
 * @returns {string} Cadena base64url.
 */
function base64url(valor) {
    return Buffer.from(valor)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

/**
 * Firma un texto con HMAC-SHA256.
 *
 * @param {string} texto - Contenido a firmar.
 * @returns {string} Firma base64url.
 */
function firmar(texto) {
    return base64url(
        crypto.createHmac('sha256', SECRETO_ESTADO).update(texto).digest()
    );
}

/**
 * Indica si un proveedor tiene credenciales reales configuradas.
 *
 * @param {string} id - `google` o `microsoft`.
 * @returns {boolean} `true` si existe `client_id` y `client_secret`.
 */
function proveedorRealConfigurado(id) {
    const proveedor = oauthProviders[id];
    return Boolean(proveedor?.clientId && proveedor?.clientSecret);
}

/**
 * Indica si está activo el modo demo local de OAuth.
 *
 * @returns {boolean} `true` si `OAUTH_DEMO` está habilitado.
 */
function demoActivo() {
    return oauthDemo;
}

/**
 * Indica si un proveedor está disponible. En modo demo, los botones
 * funcionan con la pantalla local aunque no haya credenciales reales.
 *
 * @param {string} id - `google` o `microsoft`.
 * @returns {boolean} `true` si se puede iniciar el flujo.
 */
function proveedorConfigurado(id) {
    if (!oauthProviders[id]) return false;

    return demoActivo() || proveedorRealConfigurado(id);
}

/**
 * Lista los proveedores visibles para el frontend.
 *
 * @returns {Array<{id: string, nombre: string, configurado: boolean, demo: boolean}>}
 */
function listarProveedores() {
    return Object.values(oauthProviders).map((proveedor) => ({
        id: proveedor.id,
        nombre: proveedor.nombre,
        configurado: proveedorConfigurado(proveedor.id),
        demo: demoActivo() && !proveedorRealConfigurado(proveedor.id)
    }));
}

/**
 * Construye la URL de retorno registrada en Google o Microsoft.
 *
 * @param {string} id - Identificador del proveedor.
 * @returns {string} URL absoluta del callback.
 */
function urlRetorno(id) {
    return `${oauthBaseUrl}/api/auth/oauth/${id}/callback`;
}

/**
 * Crea la solicitud de autorización: `state`, PKCE y URL del proveedor.
 *
 * @param {string} id - Identificador del proveedor.
 * @returns {{url: string, cookie: string}|null} Datos o `null` si no está configurado.
 */
function crearSolicitud(id) {
    const proveedor = oauthProviders[id];

    if (!proveedor || !proveedorRealConfigurado(id)) return null;

    const estado = crypto.randomBytes(24).toString('hex');
    const verificador = base64url(crypto.randomBytes(48));
    const reto = base64url(
        crypto.createHash('sha256').update(verificador).digest()
    );
    const expira = Date.now() + MINUTOS_ESTADO * 60 * 1000;
    const contenido = base64url(JSON.stringify({
        proveedor: id,
        estado,
        verificador,
        expira
    }));
    const cookie = `${contenido}.${firmar(contenido)}`;

    const parametros = new URLSearchParams({
        client_id: proveedor.clientId,
        redirect_uri: urlRetorno(id),
        response_type: 'code',
        scope: proveedor.scope,
        state: estado,
        code_challenge: reto,
        code_challenge_method: 'S256',
        prompt: 'select_account'
    });

    return {
        url: `${proveedor.authorizationUrl}?${parametros.toString()}`,
        cookie
    };
}

/**
 * Lee las cookies de una petición sin dependencias externas.
 *
 * @param {import('express').Request} req - Petición HTTP.
 * @returns {Record<string, string>} Cookies por nombre.
 */
function leerCookies(req) {
    const resultado = {};

    for (const parte of String(req.headers.cookie || '').split(';')) {
        const indice = parte.indexOf('=');

        if (indice < 0) continue;

        const nombre = parte.slice(0, indice).trim();
        const valor = parte.slice(indice + 1).trim();

        if (nombre) resultado[nombre] = decodeURIComponent(valor);
    }

    return resultado;
}

/**
 * Devuelve el nombre de la cookie usada por un proveedor.
 *
 * @param {string} id - Identificador del proveedor.
 * @returns {string} Nombre de la cookie.
 */
function nombreCookie(id) {
    return `${PREFIJO_COOKIE}${id}`;
}

/**
 * Genera la cabecera `Set-Cookie` que guarda el `state` y el verificador.
 *
 * @param {string} id - Identificador del proveedor.
 * @param {string} valor - Contenido firmado.
 * @returns {string} Cabecera `Set-Cookie`.
 */
function cookieSolicitud(id, valor) {
    const seguro = oauthBaseUrl.startsWith('https://') ? '; Secure' : '';

    return `${nombreCookie(id)}=${encodeURIComponent(valor)}; Path=/api/auth/oauth; `
        + `HttpOnly; SameSite=Lax; Max-Age=${MINUTOS_ESTADO * 60}${seguro}`;
}

/**
 * Genera la cabecera que borra la cookie de autorización.
 *
 * @param {string} id - Identificador del proveedor.
 * @returns {string} Cabecera `Set-Cookie`.
 */
function cookieBorrar(id) {
    return `${nombreCookie(id)}=; Path=/api/auth/oauth; HttpOnly; `
        + 'SameSite=Lax; Max-Age=0';
}

/**
 * Valida la cookie de autorización y el `state` devuelto por el proveedor.
 *
 * @param {string} id - Identificador del proveedor.
 * @param {import('express').Request} req - Petición del callback.
 * @param {string} estado - Parámetro `state` recibido.
 * @returns {{verificador: string}|null} Datos de PKCE o `null` si no es válido.
 */
function validarSolicitud(id, req, estado) {
    const cookie = leerCookies(req)[nombreCookie(id)];

    if (!cookie) return null;

    const separador = cookie.lastIndexOf('.');

    if (separador <= 0) return null;

    const contenido = cookie.slice(0, separador);
    const firma = cookie.slice(separador + 1);

    if (!compararSeguro(firma, firmar(contenido))) return null;

    let datos;

    try {
        datos = JSON.parse(
            Buffer.from(contenido, 'base64url').toString('utf8')
        );
    } catch {
        return null;
    }

    if (
        datos.proveedor !== id
        || datos.expira < Date.now()
        || !compararSeguro(String(datos.estado), String(estado || ''))
    ) {
        return null;
    }

    return { verificador: datos.verificador };
}

/**
 * Intercambia el código de autorización por un token de acceso.
 *
 * @param {string} id - Identificador del proveedor.
 * @param {string} codigo - Código devuelto por el proveedor.
 * @param {string} verificador - `code_verifier` de PKCE.
 * @returns {Promise<string>} Token de acceso.
 * @throws {Error} Si el proveedor rechaza el intercambio.
 */
async function intercambiarCodigo(id, codigo, verificador) {
    const proveedor = oauthProviders[id];

    if (!proveedor) throw new Error('Proveedor de OAuth desconocido.');

    const respuesta = await fetch(proveedor.tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: codigo,
            redirect_uri: urlRetorno(id),
            client_id: proveedor.clientId,
            client_secret: proveedor.clientSecret,
            code_verifier: verificador
        }),
        signal: AbortSignal.timeout(15000)
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || !datos.access_token) {
        throw new Error(
            datos.error_description || datos.error || 'Token rechazado.'
        );
    }

    return datos.access_token;
}

/**
 * Consulta el correo verificado del usuario en el proveedor.
 *
 * @param {string} id - Identificador del proveedor.
 * @param {string} token - Token de acceso.
 * @returns {Promise<{correo: string, verificado: boolean}>} Identidad.
 * @throws {Error} Si el proveedor no devuelve un correo.
 */
async function obtenerIdentidad(id, token) {
    const proveedor = oauthProviders[id];

    const respuesta = await fetch(proveedor.userInfoUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
        signal: AbortSignal.timeout(15000)
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new Error('No se pudo consultar el perfil del proveedor.');
    }

    const correo = String(
        datos.email || datos.mail || datos.preferred_username || ''
    ).trim().toLowerCase();
    const verificado = datos.email_verified === true
        || datos.verified_primary_email === true
        || (id === 'microsoft' && Boolean(correo));

    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        throw new Error('La cuenta no expone un correo electrónico.');
    }

    return { correo, verificado };
}

module.exports = {
    listarProveedores,
    proveedorConfigurado,
    proveedorRealConfigurado,
    demoActivo,
    crearSolicitud,
    cookieSolicitud,
    cookieBorrar,
    leerCookies,
    validarSolicitud,
    intercambiarCodigo,
    obtenerIdentidad,
    urlRetorno
};
