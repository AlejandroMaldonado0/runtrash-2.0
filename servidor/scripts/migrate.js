/**
 * @file Ejecutor de migraciones SQL.
 *
 * Lee los archivos de `servidor/migrations/` en orden, registra los ya
 * aplicados en `schema_migrations` y ejecuta cada pendiente dentro de una
 * transacción. Usa un lock de PostgreSQL para evitar que dos procesos
 * migren a la vez.
 *
 * Uso: node scripts/migrate.js
 *
 * @module scripts/migrate
 */

const fs = require('node:fs/promises');
const path = require('node:path');

/*
Carga `.env` desde `servidor/.env` aunque el script se ejecute desde
otra carpeta. Sin esto, `node servidor/scripts/migrate.js` desde la
raiz no veia las credenciales y fallaba con valores por defecto.
*/
require('dotenv').config({
    path: path.join(__dirname, '..', '.env'),
    quiet: true
});

const { Pool } = require('pg');

const EN_PRODUCCION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const SEMBRAR_DEMO = String(process.env.SEED_DEMO_ACCOUNTS || '').toLowerCase() === 'true';

/**
 * Las migraciones con `_demo` en el nombre crean cuentas con contraseñas
 * conocidas. En producción solo se aplican con SEED_DEMO_ACCOUNTS=true.
 *
 * @param {string} archivo - Nombre del archivo de migración.
 * @returns {boolean} `true` si siembra cuentas de demostración.
 */
const esMigracionDemo = (archivo) => /_demo[a-z0-9_]*\.sql$/i.test(archivo);

const connectionString = String(process.env.DATABASE_URL || '').trim();
const rechazarCertificado = String(
    process.env.DB_SSL_REJECT_UNAUTHORIZED ?? (EN_PRODUCCION ? 'true' : 'false')
).toLowerCase() !== 'false';

const pool = new Pool(
    connectionString
        ? {
            connectionString,
            ssl: { rejectUnauthorized: rechazarCertificado },
            connectionTimeoutMillis: 10000
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME || 'Runtrash',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true'
                ? { rejectUnauthorized: rechazarCertificado }
                : undefined,
            connectionTimeoutMillis: 10000
        }
);

const migrationsDirectory = path.join(__dirname, '..', 'migrations');

/**
 * Aplica las migraciones pendientes dentro de una transacción por archivo
 * y con un lock de PostgreSQL para evitar ejecuciones simultáneas.
 *
 * @returns {Promise<void>}
 */
async function migrate() {
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await client.query("SELECT pg_advisory_lock(hashtext('runtrash_schema_migrations'))");

        const files = (await fs.readdir(migrationsDirectory))
            .filter((file) => file.endsWith('.sql'))
            .sort((left, right) => left.localeCompare(right));

        const appliedResult = await client.query('SELECT name FROM schema_migrations');
        const applied = new Set(appliedResult.rows.map((row) => row.name));

        for (const file of files) {
            if (applied.has(file)) {
                console.log(`↷ ${file} ya estaba aplicada`);
                continue;
            }

            /*
            Las cuentas demo usan contraseñas conocidas. En producción
            se omiten salvo que se pida de forma explícita con
            SEED_DEMO_ACCOUNTS=true.
            */
            if (EN_PRODUCCION && esMigracionDemo(file) && !SEMBRAR_DEMO) {
                console.log(`↷ ${file} omitida en producción (SEED_DEMO_ACCOUNTS=false)`);
                continue;
            }

            const sql = await fs.readFile(path.join(migrationsDirectory, file), 'utf8');
            await client.query('BEGIN');

            try {
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (name) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`✓ ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        /*
        Si en producción no se sembraron las cuentas demo, se
        desactivan las que hayan quedado de despliegues anteriores y
        se cierran sus sesiones. Así una contraseña conocida no sirve
        para entrar.
        */
        if (EN_PRODUCCION && !SEMBRAR_DEMO) {
            await client.query('BEGIN');
            try {
                const desactivadas = await client.query(`
                    UPDATE usuarios
                    SET activo = FALSE
                    WHERE LOWER(correo) LIKE '%@runtrash.test'
                `);
                await client.query(`
                    DELETE FROM sesiones
                    WHERE usuario_id IN (
                        SELECT id FROM usuarios
                        WHERE LOWER(correo) LIKE '%@runtrash.test'
                    )
                `);
                await client.query('COMMIT');

                if (desactivadas.rowCount > 0) {
                    console.log(
                        `✓ ${desactivadas.rowCount} cuenta(s) demo desactivadas en producción`
                    );
                }
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }
    } finally {
        try {
            await client.query("SELECT pg_advisory_unlock(hashtext('runtrash_schema_migrations'))");
        } finally {
            client.release();
        }
    }
}

migrate()
    .then(() => {
        console.log('Migraciones de PostgreSQL completadas.');
    })
    .catch((error) => {
        console.error('Error aplicando migraciones:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
