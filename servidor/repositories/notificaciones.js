/**
 * @file Acceso a datos del centro de notificaciones.
 *
 * @module repositories/notificaciones
 */

const { pool } = require('../lib/db');

/**
 * Lista las últimas notificaciones del usuario.
 *
 * @param {number} usuarioId
 * @returns {Promise<{notificaciones: object[], noLeidas: number}>}
 */
async function listar(usuarioId) {
    const [resultado, noLeidas] = await Promise.all([
        pool.query(
            `
            SELECT id, tipo, titulo, mensaje, referencia_tipo, referencia_id, leida, fecha
            FROM notificaciones
            WHERE usuario_id = $1
            ORDER BY leida ASC, fecha DESC
            LIMIT 40
            `,
            [usuarioId]
        ),
        pool.query(
            `
            SELECT COUNT(*)::int AS total
            FROM notificaciones
            WHERE usuario_id = $1 AND leida = FALSE
            `,
            [usuarioId]
        )
    ]);

    return {
        notificaciones: resultado.rows,
        noLeidas: noLeidas.rows[0].total
    };
}

/**
 * Marca como leídas todas las notificaciones pendientes del usuario.
 *
 * @param {number} usuarioId
 * @returns {Promise<number>} Cantidad de notificaciones actualizadas.
 */
async function marcarLeidas(usuarioId) {
    const resultado = await pool.query(
        `
        UPDATE notificaciones
        SET leida = TRUE
        WHERE usuario_id = $1 AND leida = FALSE
        `,
        [usuarioId]
    );

    return resultado.rowCount;
}

module.exports = {
    listar,
    marcarLeidas
};
