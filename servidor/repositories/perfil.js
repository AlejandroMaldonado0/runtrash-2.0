/**
 * @file Acceso a datos del perfil personal.
 *
 * Concentra las dos consultas del cuadro de resumen de reportes y la
 * actualización de la foto de perfil. El alcance se decide por rol para
 * que cada usuario cuente solo lo que puede ver en su panel.
 *
 * @module repositories/perfil
 */

const { pool } = require('../lib/db');

/**
 * Reglas de gamificación del perfil ciudadano.
 *
 * Cada regla vale los mismos puntos en el cliente y en el servidor:
 * el servidor calcula el total real y el cliente lo convierte en nivel.
 *
 * @type {{enviado: number, fotoGeo: number, enProceso: number, completado: number, racha: number}}
 */
const PUNTOS_XP = Object.freeze({
    enviado: 50,
    fotoGeo: 20,
    enProceso: 30,
    completado: 100,
    racha: 50
});

/**
 * Convierte la actividad real del ciudadano en puntos XP.
 *
 * - 50 XP por cada reporte enviado.
 * - 20 XP extra si el reporte tiene foto y coordenadas.
 * - 30 XP cuando el reporte llegó a "en proceso" (o más adelante).
 * - 100 XP cuando el reporte se completó.
 * - 50 XP de bonus si la persona reportó durante la semana en curso.
 *
 * @param {{enviados: number, foto_geo: number, en_proceso: number, completados: number, semana: number}} fila
 * @returns {{total: number, enviados: number, fotoGeo: number, enProceso: number, completados: number, racha: number}} XP.
 */
function calcularXP(fila = {}) {
    const desglose = {
        enviados: Number(fila.enviados || 0) * PUNTOS_XP.enviado,
        fotoGeo: Number(fila.foto_geo || 0) * PUNTOS_XP.fotoGeo,
        enProceso: Number(fila.en_proceso || 0) * PUNTOS_XP.enProceso,
        completados: Number(fila.completados || 0) * PUNTOS_XP.completado,
        racha: Number(fila.semana || 0) > 0 ? PUNTOS_XP.racha : 0
    };

    return {
        total: Object.values(desglose).reduce((suma, valor) => suma + valor, 0),
        ...desglose
    };
}

/**
 * Construye la condición SQL que limita los reportes al alcance del rol.
 *
 * - Ciudadano: sus propios reportes.
 * - Operario: los que tiene asignados.
 * - Empresa: los de sus operarios y los libres de las localidades que
 *   atiende, nunca los de otra empresa.
 * - Administrador y entes de control: visión global.
 *
 * @param {object} usuario - Usuario autenticado.
 * @returns {{condicion: string, valores: Array<*>, vacio: boolean}} Filtro listo para `WHERE`.
 */
function alcanceReportes(usuario) {
    switch (usuario?.tipo_usuario) {
        case 'ciudadano':
            return {
                condicion: 'r.usuario_id = $1',
                valores: [usuario.id],
                vacio: false
            };

        case 'operario':
            return {
                condicion: 'r.operario_id = $1',
                valores: [usuario.id],
                vacio: false
            };

        case 'empresa':
            if (!usuario.empresa_id) {
                return { condicion: 'FALSE', valores: [], vacio: true };
            }

            return {
                condicion: `
                    (
                        o.empresa_id = $1
                        OR (
                            r.operario_id IS NULL
                            AND EXISTS (
                                SELECT 1
                                FROM usuarios op
                                WHERE op.tipo_usuario = 'operario'
                                  AND op.activo = TRUE
                                  AND op.empresa_id = $1
                                  AND LOWER(op.zona_asignada) = LOWER(r.localidad)
                            )
                        )
                    )
                `,
                valores: [usuario.empresa_id],
                vacio: false
            };

        default:
            return { condicion: 'TRUE', valores: [], vacio: false };
    }
}

/**
 * Cuenta los reportes del alcance, trae los últimos de cada estado y
 * calcula los puntos XP del ciudadano.
 *
 * Se limita a seis reportes por estado para que el modal siga siendo
 * ligero aunque la plataforma tenga miles de registros.
 *
 * @param {object} usuario - Usuario autenticado.
 * @returns {Promise<{total: number, pendientes: number, en_proceso: number, completados: number, reportes: object[], xp: object|null}>} Resumen.
 */
async function resumenReportes(usuario) {
    const alcance = alcanceReportes(usuario);
    const esCiudadano = usuario?.tipo_usuario === 'ciudadano';

    if (alcance.vacio) {
        return {
            total: 0,
            pendientes: 0,
            en_proceso: 0,
            completados: 0,
            reportes: [],
            xp: esCiudadano ? calcularXP() : null
        };
    }

    const desde = `
        FROM reportes r
        INNER JOIN usuarios u ON u.id = r.usuario_id
        LEFT JOIN usuarios o ON o.id = r.operario_id
        WHERE ${alcance.condicion}
    `;

    const [totales, ultimos, actividad] = await Promise.all([
        pool.query(
            `
            SELECT
                COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE r.estado = 'pendiente')::integer AS pendientes,
                COUNT(*) FILTER (WHERE r.estado = 'en proceso')::integer AS en_proceso,
                COUNT(*) FILTER (WHERE r.estado = 'completado')::integer AS completados
            ${desde}
            `,
            alcance.valores
        ),
        pool.query(
            `
            WITH del_alcance AS (
                SELECT
                    r.id,
                    r.tipo,
                    r.descripcion,
                    r.estado,
                    r.localidad,
                    COALESCE(NULLIF(BTRIM(r.ubicacion), ''), 'Sin ubicación') AS ubicacion,
                    r.fecha,
                    ROW_NUMBER() OVER (
                        PARTITION BY r.estado
                        ORDER BY r.fecha DESC, r.id DESC
                    ) AS posicion
                ${desde}
            )
            SELECT id, tipo, descripcion, estado, localidad, ubicacion, fecha
            FROM del_alcance
            WHERE posicion <= 6
            ORDER BY estado, posicion
            `,
            alcance.valores
        ),
        esCiudadano
            ? pool.query(
                `
                SELECT
                    COUNT(*)::integer AS enviados,
                    COUNT(*) FILTER (
                        WHERE COALESCE(BTRIM(r.imagen_url), '') <> ''
                          AND r.latitud IS NOT NULL
                          AND r.longitud IS NOT NULL
                    )::integer AS foto_geo,
                    COUNT(*) FILTER (
                        WHERE r.estado IN ('en proceso', 'completado')
                    )::integer AS en_proceso,
                    COUNT(*) FILTER (
                        WHERE r.estado = 'completado'
                    )::integer AS completados,
                    COUNT(*) FILTER (
                        WHERE r.fecha >= date_trunc('week', NOW())
                    )::integer AS semana
                ${desde}
                `,
                alcance.valores
            )
            : Promise.resolve({ rows: [] })
    ]);

    return {
        ...(totales.rows[0] || {
            total: 0,
            pendientes: 0,
            en_proceso: 0,
            completados: 0
        }),
        reportes: ultimos.rows,
        xp: esCiudadano ? calcularXP(actividad.rows[0]) : null
    };
}

/**
 * Guarda o borra la foto de perfil del usuario.
 *
 * @param {number} usuarioId - Identificador del usuario.
 * @param {string|null} avatar - Data URL validada o `null` para borrarla.
 * @returns {Promise<string|null>} Avatar guardado.
 */
async function actualizarAvatar(usuarioId, avatar) {
    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET avatar_url = $1
        WHERE id = $2
        RETURNING avatar_url
        `,
        [avatar, usuarioId]
    );

    return resultado.rows[0]?.avatar_url ?? null;
}

module.exports = {
    resumenReportes,
    actualizarAvatar,
    calcularXP
};
