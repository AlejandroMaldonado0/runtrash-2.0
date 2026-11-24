/**
 * @file Control de acceso a las imágenes de los reportes.
 *
 * Las fotos pueden contener direcciones, personas o detalles del lugar.
 * Por eso no se sirven como archivos estáticos: primero se valida la
 * sesión y después se comprueba que el usuario sea el dueño del reporte,
 * el operario asignado, un rol con visión global o una empresa que tenga
 * el reporte en su ámbito. Una empresa nunca ve fotos de otra.
 *
 * @module lib/imagenes
 */

const path = require('node:path');
const fs = require('node:fs');
const { pool } = require('./db');
const almacen = require('./almacen');

/** Roles que pueden consultar cualquier reporte de la plataforma. */
const ROLES_GLOBALES = new Set([
    'admin',
    'distrito',
    'policia',
    'sspd'
]);

/**
 * Extrae la clave del archivo desde el parámetro comodín de Express.
 *
 * @param {import('express').Request} req - Petición express.
 * @returns {string} Clave relativa, por ejemplo `2026/11/reporte_abc.jpg`.
 */
function obtenerClave(req) {
    const segmentos = req.params.segmentos;

    return Array.isArray(segmentos)
        ? segmentos.join('/')
        : String(segmentos || '').replace(/^\/+/, '');
}

/**
 * Determina si una empresa puede ver la foto de un reporte.
 *
 * @param {object} reporte - Fila con los datos del reporte.
 * @param {number|null} empresaId - Empresa del usuario autenticado.
 * @returns {boolean} `true` si el reporte está en su ámbito.
 */
function empresaPuedeVerImagen(reporte, empresaId) {
    if (!empresaId) return false;

    if (reporte.empresa_operario_id === empresaId) return true;

    /*
    Un reporte sin asignar puede previsualizarse por las empresas que
    tienen operarios en esa localidad, para que puedan asignarlo.
    */
    return reporte.operario_id === null
        && Boolean(reporte.localidad_atendida);
}

/**
 * Middleware que autoriza el acceso a una imagen.
 *
 * Debe ejecutarse después de `requiereSesion`. Adjunta la clave validada
 * en `req.claveImagen` para que el controlador la use.
 *
 * @type {import('express').RequestHandler}
 */
async function autorizarImagen(req, res, next) {
    const clave = obtenerClave(req);

    if (!almacen.claveSegura(clave)) {
        return res.status(400).json({
            ok: false,
            mensaje: 'Ruta de imagen no válida.'
        });
    }

    try {
        const usuario = req.usuarioAutenticado;
        const resultado = await pool.query(
            `
            SELECT
                r.usuario_id,
                r.operario_id,
                r.localidad,
                o.empresa_id AS empresa_operario_id,
                EXISTS (
                    SELECT 1
                    FROM usuarios op
                    WHERE op.tipo_usuario = 'operario'
                      AND op.activo = TRUE
                      AND op.empresa_id = $2
                      AND LOWER(op.zona_asignada) = LOWER(r.localidad)
                ) AS localidad_atendida
            FROM reportes r
            LEFT JOIN usuarios o ON o.id = r.operario_id
            WHERE r.imagen_url = $1
            LIMIT 1
            `,
            [`/uploads/${clave}`, usuario.empresa_id || null]
        );

        if (resultado.rowCount === 0) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Imagen no encontrada.'
            });
        }

        const reporte = resultado.rows[0];
        const esPropietario = reporte.usuario_id === usuario.id;
        const esOperarioAsignado = reporte.operario_id === usuario.id;
        const tieneVisionGlobal = ROLES_GLOBALES.has(usuario.tipo_usuario);
        const empresaAutorizada = usuario.tipo_usuario === 'empresa'
            && empresaPuedeVerImagen(reporte, usuario.empresa_id);

        if (
            !esPropietario
            && !esOperarioAsignado
            && !tieneVisionGlobal
            && !empresaAutorizada
        ) {
            return res.status(403).json({
                ok: false,
                mensaje: 'No tienes permisos para ver esta imagen.'
            });
        }

        req.claveImagen = clave;
        return next();
    } catch (error) {
        console.error('Error autorizando imagen:', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo validar el acceso a la imagen.'
        });
    }
}

/**
 * Envía la imagen autorizada desde disco local o almacenamiento S3.
 *
 * @param {import('express').Request} req - Petición con `claveImagen`.
 * @param {import('express').Response} res - Respuesta express.
 * @returns {Promise<void>}
 */
async function enviarImagen(req, res) {
    const clave = req.claveImagen;

    try {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        if (almacen.modo() === 'local') {
            const raiz = path.resolve(almacen.directorioLocal);
            const destino = path.resolve(raiz, clave);

            if (!destino.startsWith(`${raiz}${path.sep}`)) {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Ruta de imagen no válida.'
                });
            }

            if (!fs.existsSync(destino)) {
                return res.status(404).json({
                    ok: false,
                    mensaje: 'Imagen no encontrada.'
                });
            }

            return res.sendFile(destino);
        }

        const { cuerpo, tipo } = await almacen.leer(clave);
        res.setHeader('Content-Type', tipo);
        return res.send(cuerpo);
    } catch (error) {
        if (error && (error.name === 'NoSuchKey'
            || error.$metadata?.httpStatusCode === 404)) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Imagen no encontrada.'
            });
        }

        console.error('Error leyendo imagen:', error);
        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo leer la imagen.'
        });
    }
}

module.exports = {
    autorizarImagen,
    enviarImagen
};
