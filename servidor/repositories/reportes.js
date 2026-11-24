/**
 * @file Acceso a datos de reportes.
 *
 * @module repositories/reportes
 */

const { pool } = require('../lib/db');

/**
 * Lee el límite diario de reportes configurado.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<number>}
 */
async function limiteReportesDiarios(cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT valor
        FROM configuracion_sistema
        WHERE clave = 'limite_reportes_diarios'
        `
    );

    return Number(resultado.rows[0]?.valor || 5);
}

/**
 * Bloquea la fila del usuario para serializar sus escrituras.
 *
 * Se usa al crear reportes: mientras una petición comprueba el límite
 * diario e inserta, las demás del mismo usuario esperan su turno. Sin
 * este bloqueo dos peticiones simultáneas podrían leer el mismo conteo
 * y superar el límite.
 *
 * @param {number} usuarioId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<void>}
 */
async function bloquearUsuario(usuarioId, cliente = pool) {
    await cliente.query(
        'SELECT id FROM usuarios WHERE id = $1 FOR UPDATE',
        [usuarioId]
    );
}

/**
 * Cuenta los reportes creados por un usuario durante el día actual.
 *
 * @param {number} usuarioId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<number>}
 */
async function contarReportesHoy(usuarioId, cliente = pool) {
    const resultado = await cliente.query(
        `
        SELECT COUNT(*)::integer AS total
        FROM reportes
        WHERE usuario_id = $1
          AND fecha >= CURRENT_DATE
          AND fecha < CURRENT_DATE + INTERVAL '1 day'
        `,
        [usuarioId]
    );

    return resultado.rows[0].total;
}

/**
 * Inserta un reporte nuevo.
 *
 * @param {object} datos
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object>} Reporte creado.
 */
async function crearReporte(datos, cliente = pool) {
    const resultado = await cliente.query(
        `
        INSERT INTO reportes
        (
            usuario_id,
            tipo,
            descripcion,
            ubicacion,
            localidad,
            latitud,
            longitud,
            estado,
            imagen_url
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,'pendiente',$8)
        RETURNING *
        `,
        [
            datos.usuarioId,
            datos.tipo,
            datos.descripcion,
            datos.ubicacion,
            datos.localidad,
            datos.latitud,
            datos.longitud,
            datos.imagenUrl
        ]
    );

    return resultado.rows[0];
}

/**
 * Busca el operario activo de la localidad con menos reportes abiertos.
 *
 * @param {string} localidad - Localidad del reporte.
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @param {boolean} [bloquear=false] - Bloquear al operario elegido (`FOR UPDATE SKIP LOCKED`).
 * @returns {Promise<object|null>}
 */
async function buscarOperarioSector(localidad, cliente = pool, bloquear = false) {
    /*
    La carga se calcula con una subconsulta para poder bloquear solo la
    fila de `usuarios`: PostgreSQL no permite FOR UPDATE junto a GROUP BY.
    Con SKIP LOCKED, si dos reportes se crean a la vez, el segundo elige
    otro operario disponible en lugar de esperar al mismo.
    */
    const bloqueo = bloquear ? 'FOR UPDATE OF u SKIP LOCKED' : '';
    const resultado = await cliente.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.empresa_id,
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
          AND LOWER(u.zona_asignada) = LOWER($1)
        ORDER BY reportes_activos ASC, u.id ASC
        LIMIT 1
        ${bloqueo}
        `,
        [localidad]
    );

    return resultado.rows[0] || null;
}

/**
 * Asigna un operario y deja el reporte en proceso.
 *
 * @param {number} reporteId
 * @param {number} operarioId
 * @param {import('pg').Pool|import('pg').PoolClient} [cliente=pool] - Ejecutor de la consulta.
 * @returns {Promise<object>} Reporte actualizado.
 */
async function asignarOperario(reporteId, operarioId, cliente = pool) {
    const resultado = await cliente.query(
        `
        UPDATE reportes
        SET operario_id = $1,
            estado = 'en proceso'
        WHERE id = $2
        RETURNING *
        `,
        [operarioId, reporteId]
    );

    return resultado.rows[0];
}

/**
 * Lista los reportes de un ciudadano.
 *
 * @param {number} usuarioId
 * @returns {Promise<object[]>}
 */
async function listarPorUsuario(usuarioId) {
    const resultado = await pool.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano
        FROM reportes r
        INNER JOIN usuarios u
            ON u.id = r.usuario_id
        WHERE r.usuario_id = $1
        ORDER BY
            r.fecha DESC,
            r.id DESC
        `,
        [usuarioId]
    );

    return resultado.rows;
}

/**
 * Lista los reportes asignados a un operario.
 *
 * @param {number} operarioId
 * @returns {Promise<object[]>}
 */
async function listarPorOperario(operarioId) {
    const resultado = await pool.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano
        FROM reportes r
        INNER JOIN usuarios u
            ON u.id = r.usuario_id
        WHERE r.operario_id = $1
        ORDER BY
            r.fecha DESC,
            r.id DESC
        `,
        [operarioId]
    );

    return resultado.rows;
}

/**
 * Lista todos los reportes para empresa y administración.
 *
 * @returns {Promise<object[]>}
 */
async function listarTodos() {
    const resultado = await pool.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano,
            o.nombre AS operario
        FROM reportes r
        INNER JOIN usuarios u
            ON u.id = r.usuario_id
        LEFT JOIN usuarios o
            ON o.id = r.operario_id
        ORDER BY
            r.fecha DESC,
            r.id DESC
        `
    );

    return resultado.rows;
}

module.exports = {
    limiteReportesDiarios,
    bloquearUsuario,
    contarReportesHoy,
    crearReporte,
    buscarOperarioSector,
    asignarOperario,
    listarPorUsuario,
    listarPorOperario,
    listarTodos
};
