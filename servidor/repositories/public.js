/**
 * @file Acceso a datos de las rutas públicas.
 *
 * @module repositories/public
 */

const { pool } = require('../lib/db');

/**
 * Comprueba la conexión con PostgreSQL.
 *
 * @returns {Promise<Date|string>} Fecha actual del servidor de datos.
 */
async function ahora() {
    const resultado = await pool.query('SELECT NOW() AS ahora');
    return resultado.rows[0].ahora;
}

/**
 * Devuelve la configuración pública permitida.
 *
 * @returns {Promise<Record<string, number>>}
 */
async function configuracionPublica() {
    const resultado = await pool.query(`
        SELECT clave, valor
        FROM configuracion_sistema
        WHERE clave IN (
            'limite_reportes_diarios',
            'limite_ruta',
            'distancia_gps_maxima'
        )
    `);

    return Object.fromEntries(
        resultado.rows.map((row) => [row.clave, Number(row.valor)])
    );
}

module.exports = {
    ahora,
    configuracionPublica
};
