/**
 * @file Acceso a datos de operarios y asignaciones.
 *
 * @module repositories/empresa
 */

const { pool } = require('../lib/db');

/**
 * Lista operarios activos. El administrador puede pedir todos pasando
 * `null`; una empresa recibe solo los suyos.
 *
 * @param {number|null} empresaId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object[]>}
 */
async function listarOperarios(empresaId, cliente = pool) {
    /*
    Un `empresaId` nulo solo lo usa el administrador para ver todos los
    operarios. Una empresa concreta nunca recibe operarios de otra
    empresa: se eliminó el antiguo fallback a operarios "globales".
    */
    const resultado = await cliente.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.correo,
            u.codigo_operario,
            u.zona_asignada,
            u.empresa_id,
            (u.codigo_verificacion_hash IS NOT NULL) AS tiene_codigo_verificacion,
            e.nombre AS empresa
        FROM usuarios u
        LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.tipo_usuario = 'operario'
          AND u.activo = TRUE
          AND ($1::integer IS NULL OR u.empresa_id = $1)
          AND u.empresa_id IS NOT NULL
        ORDER BY u.nombre
        `,
        [empresaId === null || Number.isNaN(empresaId) ? null : empresaId]
    );

    return resultado.rows;
}

/**
 * Busca un operario de una empresa concreta.
 *
 * @param {number} operarioId
 * @param {number} empresaId
 * @returns {Promise<object|null>}
 */
async function buscarOperarioDeEmpresa(operarioId, empresaId) {
    const resultado = await pool.query(
        `
        SELECT id, nombre, correo, empresa_id
        FROM usuarios
        WHERE id = $1
          AND empresa_id = $2
          AND tipo_usuario = 'operario'
        LIMIT 1
        `,
        [operarioId, empresaId]
    );

    return resultado.rows[0] || null;
}

/**
 * Busca un operario activo que pueda recibir reportes de la empresa.
 *
 * @param {number} operarioId
 * @param {number|null} empresaId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object|null>}
 */
async function buscarOperarioAsignable(operarioId, empresaId, cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT id, nombre, zona_asignada
        FROM usuarios
        WHERE id = $1
          AND tipo_usuario = 'operario'
          AND activo = TRUE
          AND empresa_id IS NOT NULL
          AND ($2::integer IS NULL OR empresa_id = $2)
        `,
        [operarioId, empresaId]
    );

    return resultado.rows[0] || null;
}

/**
 * Asigna un reporte sin operario y lo deja en proceso.
 *
 * @param {number} reporteId
 * @param {number} operarioId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object|null>}
 */
async function asignarReporte(reporteId, operarioId, cliente = pool) {
    const resultado = await cliente.query(
        `
        UPDATE reportes
        SET
            operario_id = $1,
            estado = 'en proceso'
        WHERE id = $2
          AND operario_id IS NULL
        RETURNING *
        `,
        [operarioId, reporteId]
    );

    return resultado.rows[0] || null;
}

/**
 * Obtiene la información mínima de un reporte.
 *
 * @param {number} reporteId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @param {boolean} [bloquear=false] - Bloquear la fila hasta el final de la transacción.
 * @returns {Promise<object|null>}
 */
async function buscarReporte(reporteId, cliente = pool, bloquear = false) {
    const bloqueo = bloquear ? 'FOR UPDATE' : '';
    const resultado = await cliente.query(
        `
        SELECT
            r.id,
            r.localidad,
            r.operario_id,
            r.usuario_id,
            r.estado,
            r.imagen_url,
            o.empresa_id AS empresa_operario_id
        FROM reportes r
        LEFT JOIN usuarios o ON o.id = r.operario_id
        WHERE r.id = $1
        LIMIT 1
        ${bloqueo ? 'FOR UPDATE OF r' : ''}
        `,
        [reporteId]
    );

    return resultado.rows[0] || null;
}

/**
 * Comprueba si una empresa puede ver o asignar un reporte.
 *
 * Un reporte pertenece a la empresa cuando ya está asignado a uno de
 * sus operarios. Mientras sigue sin asignar, solo es visible para las
 * empresas que tienen operarios activos en esa localidad.
 *
 * @param {number} reporteId
 * @param {number} empresaId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @param {boolean} [bloquear=false] - Bloquear la fila del reporte.
 * @returns {Promise<boolean>} `true` si la empresa puede operar el reporte.
 */
async function empresaPuedeVerReporte(reporteId, empresaId, cliente = pool, bloquear = false) {
    const bloqueo = bloquear ? 'FOR UPDATE OF r' : '';
    const resultado = await cliente.query(
        `
        SELECT r.id
        FROM reportes r
        LEFT JOIN usuarios o ON o.id = r.operario_id
        WHERE r.id = $1
          AND (
            o.empresa_id = $2
            OR (
                r.operario_id IS NULL
                AND EXISTS (
                    SELECT 1
                    FROM usuarios op
                    WHERE op.tipo_usuario = 'operario'
                      AND op.activo = TRUE
                      AND op.empresa_id = $2
                      AND LOWER(op.zona_asignada) = LOWER(r.localidad)
                )
            )
          )
        LIMIT 1
        ${bloqueo}
        `,
        [reporteId, empresaId]
    );

    return resultado.rowCount > 0;
}

/**
 * Busca el operario activo con menos carga en una localidad.
 *
 * @param {string} localidad
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @param {boolean} [bloquear=false] - Bloquear al operario elegido (`FOR UPDATE SKIP LOCKED`).
 * @returns {Promise<object|null>}
 */
async function buscarOperadorPorLocalidad(
    localidad,
    empresaId = null,
    cliente = pool,
    bloquear = false
) {
    /*
    Igual que en reportes: la carga va en una subconsulta para poder
    aplicar FOR UPDATE solo a `usuarios`, y SKIP LOCKED evita que dos
    asignaciones simultáneas escojan al mismo operario.
    */
    const bloqueo = bloquear ? 'FOR UPDATE OF u SKIP LOCKED' : '';
    const resultado = await cliente.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.zona_asignada,
            (
                SELECT COUNT(*)::integer
                FROM reportes r
                WHERE r.operario_id = u.id
                  AND r.estado <> 'completado'
            ) AS reportes_activos
        FROM usuarios u
        WHERE u.tipo_usuario = 'operario'
          AND u.activo = TRUE
          AND u.empresa_id IS NOT NULL
          AND ($2::integer IS NULL OR u.empresa_id = $2)
          AND LOWER(u.zona_asignada) = LOWER($1)
        ORDER BY reportes_activos ASC, u.id ASC
        LIMIT 1
        ${bloqueo}
        `,
        [localidad, empresaId]
    );

    return resultado.rows[0] || null;
}

/**
 * Asigna automáticamente un reporte a un operario.
 *
 * @param {number} reporteId
 * @param {number} operarioId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object|null>}
 */
async function asignarAutomaticamente(reporteId, operarioId, cliente = pool) {
    const resultado = await cliente.query(
        `
        UPDATE reportes
        SET operario_id = $1,
            estado = 'en proceso'
        WHERE id = $2
          AND operario_id IS NULL
        RETURNING *
        `,
        [operarioId, reporteId]
    );

    return resultado.rows[0] || null;
}

/**
 * Actualiza el estado de un reporte asignado a un operario.
 *
 * @param {number} reporteId
 * @param {number} operarioId
 * @param {string} estado
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object|null>}
 */
async function actualizarEstado(reporteId, operarioId, estado, cliente = pool, imagenOperarioUrl = null) {
    const resultado = await cliente.query(
        `
        UPDATE reportes
        SET estado = $1,
            imagen_operario_url = CASE WHEN $1::varchar = 'completado'::varchar THEN $2::varchar ELSE NULL END
        WHERE id = $3
          AND operario_id = $4
        RETURNING *
        `,
        [estado, imagenOperarioUrl, reporteId, operarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Lista los reportes visibles para una empresa.
 *
 * Incluye los asignados a sus operarios y los que siguen sin asignar
 * en localidades donde la empresa tiene operarios, para que pueda
 * repartirlos. Nunca devuelve reportes de otra empresa.
 *
 * @param {number} empresaId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object[]>} Reportes visibles.
 */
async function listarReportesEmpresa(empresaId, cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano,
            o.nombre AS operario
        FROM reportes r
        INNER JOIN usuarios u ON u.id = r.usuario_id
        LEFT JOIN usuarios o ON o.id = r.operario_id
        WHERE o.empresa_id = $1
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
        ORDER BY r.fecha DESC, r.id DESC
        `,
        [empresaId]
    );

    return resultado.rows;
}

/**
 * Obtiene un operario por su identificador.
 *
 * @param {number} operarioId - Identificador del operario.
 * @returns {Promise<object|null>} Operario encontrado.
 */
async function obtenerOperario(operarioId) {
    const resultado = await pool.query(
        `
        SELECT id, nombre, correo, tipo_usuario, codigo_operario, zona_asignada, empresa_id, nit_empresa, activo
        FROM usuarios
        WHERE id = $1
          AND tipo_usuario = 'operario'
        LIMIT 1
        `,
        [operarioId]
    );

    return resultado.rows[0] || null;
}

module.exports = {
    listarOperarios,
    buscarOperarioDeEmpresa,
    buscarOperarioAsignable,
    asignarReporte,
    buscarReporte,
    empresaPuedeVerReporte,
    listarReportesEmpresa,
    buscarOperadorPorLocalidad,
    asignarAutomaticamente,
    actualizarEstado
};
