/**
 * @file Tareas periódicas de mantenimiento.
 *
 * - Retención de reportes antiguos y sus imágenes.
 * - Limpieza de sesiones expiradas.
 *
 * Se ejecutan al arrancar y luego desde un intervalo en `server.js`.
 *
 * @module lib/mantenimiento
 */

const { pool } = require('./db');
const { mapaConcurrente } = require('./concurrencia');
const { hashPassword } = require('./security');
const almacen = require('./almacen');

/**
 * Elimina reportes antiguos según la retención configurada y borra
 * también sus imágenes del almacenamiento para no dejar huérfanas.
 *
 * La retención se lee de `configuracion_sistema.retencion_dias`
 * (90 días por defecto).
 *
 * @returns {Promise<void>}
 */
async function purgarReportesRetirados() {
    try {
        const configuracion = await pool.query(
            "SELECT valor FROM configuracion_sistema WHERE clave = 'retencion_dias'"
        );
        const dias = Number(configuracion.rows[0]?.valor || 90);

        /*
        Se recuperan las imagenes antes de borrar, para eliminar
        tambien el archivo del almacenamiento y no acumular
        imagenes huerfanas.
        */
        const aBorrar = await pool.query(
            `
            SELECT id, imagen_url
            FROM reportes
            WHERE fecha < NOW() - ($1 * INTERVAL '1 day')
              AND imagen_url IS NOT NULL
            `,
            [dias]
        );

        const resultado = await pool.query(
            `
            DELETE FROM reportes
            WHERE fecha < NOW() - ($1 * INTERVAL '1 day')
            `,
            [dias]
        );

        /*
        Las imágenes se borran en paralelo con un límite de 4: son
        operaciones de red/disco independientes y no conviene abrir una
        por cada reporte antiguo. Cada fallo se registra sin detener el
        resto.
        */
        await mapaConcurrente(aBorrar.rows, 4, async (reporte) => {
            try {
                await almacen.eliminar(
                    String(reporte.imagen_url).replace(/^\/uploads\//, '')
                );
                return true;
            } catch (errorImagen) {
                console.error(
                    `No se pudo borrar la imagen del reporte ${reporte.id}:`,
                    errorImagen
                );
                return false;
            }
        });

        if (resultado.rowCount > 0) {
            console.log(`Reportes eliminados por retención: ${resultado.rowCount}`);
        }
    } catch (error) {
        console.error('Error aplicando retención:', error);
    }
}

/**
 * Borra las sesiones cuya fecha de expiración ya pasó y los códigos
 * OAuth usados o vencidos, para que las tablas no crezcan sin límite.
 *
 * @returns {Promise<void>}
 */
async function limpiarSesionesExpiradas() {
    await pool.query('DELETE FROM sesiones WHERE expira <= NOW()');
    await pool.query(
        'DELETE FROM oauth_codigos WHERE usado = TRUE OR expira < NOW()'
    );
}

/**
 * Convierte a `scrypt` las contraseñas heredadas que quedaron en texto
 * plano. Se ejecuta al arrancar, antes de aceptar peticiones, para que
 * `verifyPassword` pueda rechazar siempre valores no hasheados.
 *
 * El `UPDATE` incluye el valor anterior en el `WHERE` para no pisar un
 * cambio de contraseña que ocurra entre la lectura y la escritura.
 *
 * @returns {Promise<number>} Cantidad de cuentas migradas.
 */
async function migrarPasswordsHeredadas() {
    try {
        const resultado = await pool.query(`
            SELECT id, password
            FROM usuarios
            WHERE password IS NOT NULL
              AND password <> ''
              AND password NOT LIKE 'scrypt$%'
        `);

        let migradas = 0;

        for (const cuenta of resultado.rows) {
            const actualizado = await pool.query(
                `
                UPDATE usuarios
                SET password = $1
                WHERE id = $2
                  AND password = $3
                `,
                [hashPassword(cuenta.password), cuenta.id, cuenta.password]
            );

            migradas += actualizado.rowCount;
        }

        if (migradas > 0) {
            console.log(
                `Contraseñas heredadas convertidas a scrypt: ${migradas}`
            );
        }

        return migradas;
    } catch (error) {
        console.error('Error migrando contraseñas heredadas:', error);
        return 0;
    }
}

module.exports = {
    purgarReportesRetirados,
    limpiarSesionesExpiradas,
    migrarPasswordsHeredadas
};
