/**
 * @file Centro de notificaciones.
 *
 * Agrupa la persistencia de notificaciones y la resolución de
 * destinatarios por rol. No conoce HTTP: recibe ids y datos de
 * negocio y devuelve resultados.
 *
 * @module lib/notificaciones
 */

const { pool } = require('./db');

/**
 * Guarda una notificación para uno o varios usuarios.
 *
 * @param {Array<number>} usuarioIds - Destinatarios (se deduplican).
 * @param {object} notificacion - Contenido de la notificación.
 * @param {string} [notificacion.tipo='info'] - Categoría visual.
 * @param {string} notificacion.titulo - Título obligatorio.
 * @param {string} [notificacion.mensaje=''] - Cuerpo del mensaje.
 * @param {string|null} [notificacion.referenciaTipo=null] - Entidad referida.
 * @param {number|null} [notificacion.referenciaId=null] - Id de la entidad.
 * @returns {Promise<number>} Cantidad de filas insertadas.
 */
async function notificarUsuarios(usuarioIds, notificacion) {
    const destinatarios = [...new Set((usuarioIds || []).filter(Boolean))];

    if (!destinatarios.length) return 0;

    const {
        tipo = 'info',
        titulo,
        mensaje = '',
        referenciaTipo = null,
        referenciaId = null
    } = notificacion;

    try {
        const resultado = await pool.query(
            `
            INSERT INTO notificaciones
                (usuario_id, tipo, titulo, mensaje, referencia_tipo, referencia_id)
            SELECT UNNEST($1::int[]), $2, $3, $4, $5, $6
            `,
            [destinatarios, tipo, titulo, mensaje, referenciaTipo, referenciaId]
        );
        return resultado.rowCount;
    } catch (error) {
        console.error('Error guardando notificación:', error);
        return 0;
    }
}

/**
 * Obtiene los ids de usuarios activos por rol.
 *
 * @param {string} tipoUsuario - `admin`, `empresa`, `ciudadano` u `operario`.
 * @param {object} [opciones]
 * @param {number|null} [opciones.empresaId=null] - Filtra por empresa.
 * @returns {Promise<number[]>} Ids encontrados.
 */
async function idsPorRol(tipoUsuario, { empresaId = null } = {}) {
    const condiciones = ['tipo_usuario = $1', 'activo = TRUE'];
    const valores = [tipoUsuario];

    if (empresaId !== null) {
        valores.push(empresaId);
        condiciones.push(`empresa_id = $${valores.length}`);
    }

    const resultado = await pool.query(
        `SELECT id FROM usuarios WHERE ${condiciones.join(' AND ')}`,
        valores
    );

    return resultado.rows.map((row) => row.id);
}

module.exports = {
    notificarUsuarios,
    idsPorRol
};
