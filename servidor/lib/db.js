/**
 * @file Conexión a PostgreSQL.
 *
 * Crea un único `Pool` compartido por toda la aplicación. En
 * despliegue se recomienda `DATABASE_URL` (Neon, Supabase, Railway,
 * Render); en local se pueden usar las variables `DB_*`.
 *
 * @module lib/db
 */

const { Pool } = require('pg');

const connectionString = String(process.env.DATABASE_URL || '').trim();
const enProduccion = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const usarSslRemoto = Boolean(connectionString)
    || String(process.env.DB_SSL || '').toLowerCase() === 'true';

/**
 * Configuración TLS de PostgreSQL.
 *
 * En producción se verifica el certificado del servidor por defecto.
 * `DB_SSL_REJECT_UNAUTHORIZED=false` queda como escape explícito para
 * proveedores con certificados autofirmados.
 *
 * @returns {{rejectUnauthorized: boolean}} Opciones TLS.
 */
function opcionesSsl() {
    const rechazar = String(
        process.env.DB_SSL_REJECT_UNAUTHORIZED ?? (enProduccion ? 'true' : 'false')
    ).toLowerCase() !== 'false';

    return { rejectUnauthorized: rechazar };
}

/**
 * Pool de conexiones compartido.
 * @type {import('pg').Pool}
 */
const pool = new Pool(
    connectionString
        ? {
            connectionString,
            ssl: opcionesSsl(),
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME || 'Runtrash',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            ssl: usarSslRemoto ? opcionesSsl() : undefined,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000
        }
);

pool.on('error', (error) => {
    console.error('Error inesperado de PostgreSQL:', error);
});

/**
 * Comprueba la conectividad con la base de datos.
 *
 * @returns {Promise<Date>} Fecha/hora actual reportada por PostgreSQL.
 * @throws {Error} Si la consulta falla.
 */
async function comprobarConexion() {
    const resultado = await pool.query('SELECT NOW() AS ahora');
    return resultado.rows[0].ahora;
}

/**
 * Cierra el pool. Útil en pruebas y en apagados ordenados.
 *
 * @returns {Promise<void>}
 */
async function cerrarPool() {
    await pool.end();
}

/**
 * Ejecuta un trabajo dentro de una transacción.
 *
 * Reserva un cliente del pool, abre la transacción y la confirma o la
 * revierte según el resultado. La transacción es la herramienta para
 * evitar carreras: dos peticiones simultáneas no pueden leer y escribir
 * el mismo estado sin coordinarse.
 *
 * @template T
 * @param {(cliente: import('pg').PoolClient) => Promise<T>} trabajo - Operaciones a ejecutar.
 * @returns {Promise<T>} Valor devuelto por el trabajo.
 * @throws {Error} Si el trabajo falla; la transacción se revierte.
 */
async function conTransaccion(trabajo) {
    const cliente = await pool.connect();

    try {
        await cliente.query('BEGIN');
        const resultado = await trabajo(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (error) {
        try {
            await cliente.query('ROLLBACK');
        } catch (errorRollback) {
            console.error('No se pudo revertir la transacción:', errorRollback);
        }
        throw error;
    } finally {
        cliente.release();
    }
}

module.exports = {
    pool,
    comprobarConexion,
    cerrarPool,
    conTransaccion
};
