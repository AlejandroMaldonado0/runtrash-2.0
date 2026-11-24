/**
 * @file Configuración central del servidor RunTrash.
 *
 * Reúne en un solo lugar la lectura de variables de entorno, las
 * constantes de negocio y las políticas HTTP (CORS y CSP). Así el
 * resto de módulos no depende directamente de `process.env`.
 *
 * @module config
 */

const path = require('path');

/**
 * Lee una variable de entorno numérica y aplica un valor por defecto.
 *
 * @param {string} nombre - Nombre de la variable.
 * @param {number} porDefecto - Valor usado si no existe o no es numérico.
 * @returns {number} Valor numérico validado.
 */
function leerNumero(nombre, porDefecto) {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) ? valor : porDefecto;
}

/** Puerto HTTP del servidor. */
const PORT = leerNumero('PORT', 3000);

/** Horas de vigencia de una sesión. */
const SESSION_HOURS = leerNumero('SESSION_HOURS', 12);

/** Tamaño máximo permitido para una imagen subida (MB). */
const MAX_UPLOAD_MB = leerNumero('MAX_UPLOAD_MB', 8);

/** Directorio donde se guardan las imágenes en modo local. */
const uploadsDir = path.join(__dirname, 'uploads');

/**
 * Localidades válidas para clasificar reportes y zonas de operarios.
 * @type {Set<string>}
 */
const LOCALIDADES = new Set([
    'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme',
    'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
    'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires',
    'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
    'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz'
]);

/**
 * URL pública desde la que se sirve el frontend y la API. Se usa para
 * construir el `redirect_uri` de Google y Microsoft, que debe coincidir
 * exactamente con el registrado en cada consola de desarrollador.
 * @type {string}
 */
const oauthBaseUrl = String(
    process.env.OAUTH_BASE_URL || `http://localhost:${PORT}`
).replace(/\/+$/, '');

/**
 * Proveedores de OAuth 2.0 disponibles. Cada uno solo se considera
 * configurado cuando existen su `client_id` y `client_secret`.
 * @type {Record<string, {id: string, nombre: string, clientId: string, clientSecret: string, authorizationUrl: string, tokenUrl: string, userInfoUrl: string, scope: string}>}
 */
const oauthProviders = {
    google: {
        id: 'google',
        nombre: 'Google',
        clientId: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
        scope: 'openid email profile'
    },
    microsoft: {
        id: 'microsoft',
        nombre: 'Outlook',
        clientId: String(process.env.MICROSOFT_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.MICROSOFT_CLIENT_SECRET || '').trim(),
        authorizationUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl:
            'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
        scope: 'openid email profile'
    }
};

/**
 * Indica si una URL apunta a la máquina local. El modo demo se limita a
 * localhost salvo que se habilite explícitamente para un servidor
 * remoto de demostración.
 *
 * @param {string} valor - URL base de OAuth.
 * @returns {boolean} `true` si el host es local.
 */
function esUrlLocal(valor) {
    try {
        const host = new URL(valor).hostname.toLowerCase();
        return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
    } catch {
        return false;
    }
}

/**
 * Modo demo local de OAuth. Permite probar los botones de Google y
 * Outlook sin credenciales reales: el servidor muestra una pantalla
 * local donde se escribe el correo ya registrado en RunTrash. Nunca
 * debe activarse en producción.
 * @type {boolean}
 */
const oauthDemoSolicitado = /^(1|true|si|sí|yes|on)$/i.test(
    String(process.env.OAUTH_DEMO || '').trim()
);
const oauthDemoRemoto = /^(1|true|si|sí|yes|on)$/i.test(
    String(process.env.OAUTH_DEMO_REMOTO || '').trim()
);
const oauthDemo = oauthDemoSolicitado
    && (esUrlLocal(oauthBaseUrl) || oauthDemoRemoto);

if (oauthDemo) {
    console.warn(
        'AVISO: OAUTH_DEMO activo. Los botones de Google/Outlook no validan '
        + 'la identidad real y permiten entrar con un correo registrado. '
        + 'No lo dejes activo en producción.'
    );
} else if (oauthDemoSolicitado) {
    console.warn(
        'AVISO: OAUTH_DEMO se ignoró porque OAUTH_BASE_URL no es local. '
        + 'Si de verdad necesitas la demo en un servidor remoto, define '
        + 'OAUTH_DEMO_REMOTO=1 bajo tu responsabilidad.'
    );
}

/**
 * Orígenes permitidos por CORS. Si está vacío solo se aceptan
 * peticiones sin `Origin` (curl, health checks) y el mismo origen.
 * Nunca se abre a cualquier sitio por omisión.
 * @type {string[]}
 */
const corsOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

/**
 * Política de seguridad de contenido (CSP).
 *
 * Todos los scripts viven en archivos externos y los manejadores se
 * declaran con `data-accion`, así que no se necesita `unsafe-inline`
 * ni `unsafe-eval` en ninguna directiva de scripts. `styleSrc` mantiene
 * `unsafe-inline` por los atributos `style` dinámicos de los mapas.
 * @type {Record<string, unknown>}
 */
const cspDirectivas = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    fontSrc: ["'self'", 'https:', 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", 'https://unpkg.com'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https:', 'https://unpkg.com'],
    connectSrc: ["'self'", 'https:'],
    /* Sin frame-src los iframes de Google Maps quedan bloqueados. */
    frameSrc: [
        "'self'",
        'https://maps.google.com',
        'https://www.google.com',
        'https://maps.googleapis.com',
        'https://www.openstreetmap.org',
        'https://www.bing.com'
    ],
    workerSrc: ["'self'", 'blob:'],
    upgradeInsecureRequests: []
};

module.exports = {
    PORT,
    SESSION_HOURS,
    MAX_UPLOAD_MB,
    uploadsDir,
    LOCALIDADES,
    oauthBaseUrl,
    oauthProviders,
    oauthDemo,
    corsOrigins,
    cspDirectivas
};
