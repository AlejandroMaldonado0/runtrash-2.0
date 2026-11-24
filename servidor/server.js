/**
 * @file Punto de entrada de la API RunTrash.
 *
 * Orquesta Express, la seguridad HTTP, las rutas REST y el arranque
 * del servidor. La lógica de infraestructura se ha extraído a
 * módulos reutilizables:
 *
 * - `config.js`            → variables de entorno y políticas HTTP.
 * - `lib/db.js`            → pool de PostgreSQL.
 * - `lib/auth.js`          → sesiones y roles.
 * - `lib/eventos.js`       → Server-Sent Events (tiempo real).
 * - `lib/notificaciones.js`→ centro de notificaciones.
 * - `lib/upload.js`        → subida de imágenes (Multer).
 * - `lib/almacen.js`       → disco local o Neon Object Storage.
 * - `lib/security.js`      → hash de contraseñas y tokens.
 * - `lib/limiters.js`      → rate limiting general y de auth.
 * - `lib/mantenimiento.js` → retención y limpieza de sesiones.
 * - `lib/admin-inicial.js` → cuenta administradora inicial.
 * - `routes/*.js`          → routers por dominio (auth, reportes, admin…).
 *
 * @module server
 */

/*
La ruta de `.env` se resuelve desde este archivo y no desde el
directorio actual. Así `node servidor/server.js` funciona igual si se
ejecuta desde la raíz del proyecto o desde `servidor/`.
*/
require('dotenv').config({
    path: require('node:path').join(__dirname, '.env'),
    quiet: true
});

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { generalLimiter } = require('./lib/limiters');
const {
    purgarReportesRetirados,
    limpiarSesionesExpiradas,
    migrarPasswordsHeredadas
} = require('./lib/mantenimiento');
const { inicializarAdministrador } = require('./lib/admin-inicial');
const almacen = require('./lib/almacen');
const { autorizarImagen, enviarImagen } = require('./lib/imagenes');
const {
    permitirTokenEnQuery,
    requiereSesion
} = require('./lib/auth');
const { pool } = require('./lib/db');
const controlRoutes = require('./routes/control');
const authRoutes = require('./routes/auth');
const notificacionesRoutes = require('./routes/notificaciones');
const reportesRoutes = require('./routes/reportes');
const empresaRoutes = require('./routes/empresa');
const adminRoutes = require('./routes/admin');
const perfilRoutes = require('./routes/perfil');
const publicRoutes = require('./routes/public');
const {
    PORT,
    MAX_UPLOAD_MB,
    uploadsDir,
    corsOrigins,
    cspDirectivas
} = require('./config');

const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
/*
La CSP y el resto de la configuración viven en `config.js`. Véase
ese módulo para el detalle de cada directiva.
*/
app.use(helmet({
    contentSecurityPolicy: { directives: cspDirectivas },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
/**
 * Valida el origen de una petición CORS.
 *
 * Solo se permiten peticiones sin `Origin` (curl, health checks), el
 * mismo origen y los orígenes explícitos de `CORS_ORIGINS`. Si la lista
 * está vacía no se abre a cualquier sitio: el navegador de otra web no
 * podrá leer las respuestas de la API.
 *
 * @type {import('express').RequestHandler}
 */
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) return next();

    const mismoOrigen = origin === `${req.protocol}://${req.get('host')}`;

    /*
    Algunos navegadores (y el modo headless de Chrome) envían
    `Origin: null` en envíos de formularios del mismo sitio. Se acepta
    solo cuando el navegador confirma que la navegación es propia; un
    sitio externo no puede falsificar `Sec-Fetch-Site`.
    */
    const navegacionPropia = String(origin) === 'null'
        && ['same-origin', 'none'].includes(
            String(req.headers['sec-fetch-site'] || '').toLowerCase()
        );

    const permitido = mismoOrigen
        || navegacionPropia
        || corsOrigins.includes(origin);

    if (!permitido) {
        if (req.method === 'OPTIONS') {
            return res.status(403).end();
        }

        return res.status(403).json({
            ok: false,
            mensaje: 'Origen no permitido.'
        });
    }

    if (origin !== 'null') {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
    );
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    return next();
});

/*
Las respuestas de la API llevan datos de sesión y personales. Se
desactiva la caché para que el navegador y los proxies no guarden una
copia que pueda quedar accesible después del cierre de sesión.
*/
app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use('/api', generalLimiter);

/* Rutas modulares por dominio. */
app.use('/api', publicRoutes);
app.use('/api', authRoutes);
app.use('/api/notificaciones', notificacionesRoutes);
app.use('/api', reportesRoutes);
app.use('/api', empresaRoutes);
app.use('/api', adminRoutes);
app.use('/api', perfilRoutes);
app.use('/api/control', controlRoutes);

/*
La conexión a PostgreSQL se crea en `lib/db.js` y se comparte como
un único pool.
*/

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

/*
Las fotos pueden contener datos personales o del domicilio, por eso
no se sirven como carpeta estatica. La ruta exige sesion y despues
comprueba que el usuario sea el dueño, el operario asignado o tenga
un rol con vision global. Funciona igual con disco local y con S3.
*/
app.get(
    '/uploads/{*segmentos}',
    permitirTokenEnQuery,
    requiereSesion,
    autorizarImagen,
    enviarImagen
);

/*
=========================================================
ERRORES
=========================================================
*/

app.use(
    (error, _req, res, _next) => {

        console.error(
            'ERROR DEL SERVIDOR:',
            error
        );

        const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
        const mensaje = error.code === 'LIMIT_FILE_SIZE'
            ? `La imagen supera el límite de ${MAX_UPLOAD_MB} MB.`
            : status === 500
                ? 'Error interno del servidor.'
                : error.message;

        res.status(status).json({
            ok: false,
            mensaje,
            // Se expone el detalle solo si se pide explicitamente,
            // para poder diagnosticar fallos en produccion sin
            // filtrar informacion sensible por defecto.
            ...(process.env.DIAGNOSTICO_DETALLE === 'true'
                ? { detalle: error.message, codigo: error.code || null }
                : {})
        });
    }
);

/*
=========================================================
FRONTEND EN EL MISMO SERVICIO (opcional)
=========================================================
Para desplegar todo junto en un solo dominio (un solo servicio
gratuito y una sola URL), define FRONTEND_DIR con la ruta de la
carpeta que contiene los .html.

Solo se exponen los archivos de una lista blanca. Nunca se
sirven .env, server.js, scripts, migraciones ni node_modules.
*/

/*
Sin `FRONTEND_DIR` se usa la carpeta que contiene a `servidor/`. Eso
permite arrancar con `node servidor/server.js` desde la raíz y abrir
las páginas en el mismo puerto, sin un servidor estático aparte.
*/
const frontendDir = String(process.env.FRONTEND_DIR || '').trim()
    ? path.resolve(process.env.FRONTEND_DIR)
    : path.resolve(__dirname, '..');

const ARCHIVOS_PUBLICOS = [
    'index.html',
    'ciudadano.html',
    'empresa.html',
    'operario.html',
    'admin.html',
    'control.html',
    'styles.css',
    'ui.js',
    'features.js',
    'config.js'
];

const CARPETAS_PUBLICAS = ['logos', 'frontend'];

if (frontendDir && fs.existsSync(frontendDir)) {
    app.get('/', (_req, res) => {
        res.sendFile(path.join(frontendDir, 'index.html'));
    });

    for (const archivo of ARCHIVOS_PUBLICOS) {
        app.get(`/${archivo}`, (_req, res) => {
            const destino = path.join(frontendDir, archivo);
            if (!fs.existsSync(destino)) {
                return res.status(404).type('text/plain').send('Archivo no disponible.');
            }
            res.sendFile(destino);
        });
    }

    for (const carpeta of CARPETAS_PUBLICAS) {
        /*
        El código del frontend cambia con cada despliegue: se sirve con
        `no-cache` para que el navegador revalide (ETag → 304) y no se
        quede con una versión vieja durante días. Las imágenes y logos
        conservan la caché larga.
        */
        const opciones = {
            index: false,
            dotfiles: 'deny',
            maxAge: '7d'
        };

        if (carpeta === 'frontend') {
            opciones.setHeaders = (res, ruta) => {
                if (/\.(?:js|css|html|json|svg)$/i.test(ruta)) {
                    res.setHeader('Cache-Control', 'no-cache');
                }
            };
        }

        app.use(
            `/${carpeta}`,
            express.static(path.join(frontendDir, carpeta), opciones)
        );
    }

    console.log(`Frontend servido desde ${frontendDir}`);
}

app.use((_req, res) => {
    res.status(404).json({
        ok: false,
        mensaje: 'Ruta no encontrada.'
    });
});

/**
 * Arranca la API: inicializa administrador, limpia sesiones, aplica
 * retención, escucha en `PORT` y registra el apagado ordenado.
 *
 * @returns {Promise<void>}
 */
async function iniciarServidor() {
    /*
    Antes de aceptar peticiones se convierten a scrypt las contraseñas
    heredadas. `verifyPassword` ya no acepta texto plano, así que este
    paso evita dejar cuentas antiguas fuera de servicio.
    */
    await migrarPasswordsHeredadas();
    await inicializarAdministrador();
    await limpiarSesionesExpiradas();
    await purgarReportesRetirados();

    const servidor = app.listen(PORT, () => {
        const info = almacen.resumen();
        console.log('========================================');
        console.log(`RunTrash API ejecutándose en http://localhost:${PORT}`);
        console.log(`Imágenes: almacenamiento ${info.modo}`
            + (info.modo === 's3'
                ? ` (bucket ${info.bucket} en ${info.region})`
                : ' (disco local, se pierden al redesplegar)'));
        console.log('========================================');
    });

    const intervaloRetencion = setInterval(purgarReportesRetirados, 24 * 60 * 60 * 1000);
    intervaloRetencion.unref();

    /**
     * Cierra el servidor y el pool de PostgreSQL ante una señal del sistema.
     *
     * @param {string} signal - Señal recibida (`SIGINT`, `SIGTERM`).
     * @returns {Promise<void>}
     */
    const cerrar = async (signal) => {
        console.log(`${signal}: cerrando RunTrash API...`);
        clearInterval(intervaloRetencion);
        servidor.close(async () => {
            await pool.end();
            process.exit(0);
        });
    };

    process.once('SIGINT', () => cerrar('SIGINT'));
    process.once('SIGTERM', () => cerrar('SIGTERM'));
}

if (require.main === module) {
    iniciarServidor().catch((error) => {
        console.error('No se pudo iniciar RunTrash API:', error.message);
        pool.end().finally(() => process.exit(1));
    });
}

module.exports = app;