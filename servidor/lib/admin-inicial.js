/**
 * @file Creación/actualización de la cuenta administradora inicial.
 *
 * Lee `ADMIN_EMAIL`, `ADMIN_NAME` y `ADMIN_PASSWORD`. Si la clave es
 * débil o no está configurada, no hace cambios y deja un aviso.
 *
 * @module lib/admin-inicial
 */

const { pool } = require('./db');
const { hashPassword, validarPassword } = require('./security');

/**
 * Crea o actualiza la cuenta administradora definida por
 * `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Si faltan o la clave es débil,
 * no hace nada y deja un aviso en consola.
 *
 * @returns {Promise<void>}
 */
async function inicializarAdministrador() {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;

    const validacionPassword = validarPassword(process.env.ADMIN_PASSWORD);

    if (
        !validacionPassword.ok
        || process.env.ADMIN_PASSWORD === 'cambia_esta_clave_de_administrador'
    ) {
        console.warn(
            'ADMIN_PASSWORD no cumple la política (mínimo 8 caracteres, '
            + 'con letras y números); no se creó/actualizó el administrador.'
        );
        return;
    }

    const adminEmail = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const adminName = process.env.ADMIN_NAME || 'Administrador RunTrash';
    const adminPasswordHash = hashPassword(process.env.ADMIN_PASSWORD);

    const existing = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1',
        [adminEmail]
    );

    if (existing.rowCount > 0) {
        await pool.query(
            `
            UPDATE usuarios
            SET nombre = $1,
                password = $2,
                tipo_usuario = 'admin',
                activo = TRUE
            WHERE id = $3
            `,
            [adminName, adminPasswordHash, existing.rows[0].id]
        );

        /*
        Al rotar la contraseña del administrador se cierran sus sesiones
        para que un token anterior no siga vigente con las credenciales
        viejas.
        */
        await pool.query(
            'DELETE FROM sesiones WHERE usuario_id = $1',
            [existing.rows[0].id]
        );
        return;
    }

    await pool.query(
        `
        INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
        VALUES ($1, $2, $3, 'admin', TRUE)
        `,
        [adminName, adminEmail, adminPasswordHash]
    );
}

module.exports = { inicializarAdministrador };
