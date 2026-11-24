/**
 * @file Autenticación y autorización por roles.
 *
 * Contiene la lectura del token, el middleware que valida la sesión
 * contra PostgreSQL y los guards reutilizables por rol.
 *
 * @module lib/auth
 */

const { pool } = require('./db');
const { hashSessionToken } = require('./security');

/**
 * Marca la petición para que `obtenerToken` acepte `?token=`.
 *
 * El token en la URL solo se permite en los dos casos donde el
 * navegador no puede enviar la cabecera `Authorization`:
 * Server-Sent Events (`EventSource`) y las etiquetas `<img>`.
 *
 * @type {import('express').RequestHandler}
 */
function permitirTokenEnQuery(req, _res, next) {
    req.aceptaTokenEnQuery = true;
    next();
}

/**
 * Extrae el token de sesión de la petición.
 *
 * Prioriza `Authorization: Bearer <token>`. El parámetro `?token=`
 * solo se lee cuando la ruta lo habilitó expresamente con
 * `permitirTokenEnQuery`; en el resto de la API se ignora para que el
 * token no quede en historiales, logs o enlaces compartidos.
 *
 * @param {import('express').Request} req - Petición express.
 * @returns {string} Token o cadena vacía.
 */
function obtenerToken(req) {
    const encabezado = req.headers.authorization || '';

    if (encabezado.startsWith('Bearer ')) {
        return encabezado.slice(7).trim();
    }

    if (req.aceptaTokenEnQuery === true) {
        return String(req.query.token || '').trim();
    }

    return '';
}

/**
 * Middleware que exige una sesión válida y activa.
 *
 * Adjunta el usuario autenticado en `req.usuarioAutenticado`.
 *
 * @type {import('express').RequestHandler}
 */
async function requiereSesion(req, res, next) {
    const token = obtenerToken(req);

    if (!token) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Debes iniciar sesión.'
        });
    }

    try {
        const resultado = await pool.query(
            `
            SELECT
                u.id,
                u.nombre,
                u.correo,
                u.tipo_usuario,
                u.codigo_operario,
                u.zona_asignada,
                u.empresa_id,
                u.nit_empresa,
                u.avatar_url,
                u.fecha_registro,
                u.activo,
                e.nombre AS empresa_nombre,
                e.nit AS empresa_nit
            FROM sesiones s
            INNER JOIN usuarios u ON u.id = s.usuario_id
            LEFT JOIN empresas e ON e.id = u.empresa_id
            WHERE s.token = $1
              AND s.expira > NOW()
              AND u.activo = TRUE
            LIMIT 1
            `,
            [hashSessionToken(token)]
        );

        if (resultado.rowCount === 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Tu sesión expiró o no es válida.'
            });
        }

        req.usuarioAutenticado = resultado.rows[0];
        next();
    } catch (error) {
        console.error('Error validando sesión:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al validar la sesión.'
        });
    }
}

/**
 * Crea un middleware que exige que el usuario tenga uno de los roles.
 *
 * @param {...string} roles - Roles permitidos.
 * @returns {import('express').RequestHandler} Middleware de autorización.
 */
function requiereRoles(...roles) {
    return (req, res, next) => {
        if (!req.usuarioAutenticado) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Debes iniciar sesión.'
            });
        }

        if (!roles.includes(req.usuarioAutenticado.tipo_usuario)) {
            return res.status(403).json({
                ok: false,
                mensaje: 'No tienes permisos para realizar esta acción.'
            });
        }

        next();
    };
}

/** Guards listos para usar por rol. */
const requiereAdmin = [requiereSesion, requiereRoles('admin')];
const requiereCiudadano = [requiereSesion, requiereRoles('ciudadano')];
const requiereOperario = [requiereSesion, requiereRoles('operario')];
const requiereEmpresa = [requiereSesion, requiereRoles('empresa', 'admin')];

/** Entes de control externos: Distrito, Policía y SSPD. */
const requiereDistrito = [requiereSesion, requiereRoles('distrito')];
const requierePolicia = [requiereSesion, requiereRoles('policia')];
const requiereSspd = [requiereSesion, requiereRoles('sspd')];

/**
 * Permite el acceso a cualquiera de los entes de control.
 * El administrador también puede consultar estos endpoints.
 */
const requiereEnteControl = [
    requiereSesion,
    requiereRoles('distrito', 'policia', 'sspd', 'admin')
];

module.exports = {
    permitirTokenEnQuery,
    obtenerToken,
    requiereSesion,
    requiereRoles,
    requiereAdmin,
    requiereCiudadano,
    requiereOperario,
    requiereEmpresa,
    requiereDistrito,
    requierePolicia,
    requiereSspd,
    requiereEnteControl
};
