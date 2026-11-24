/**
 * @file Acceso a datos de administración.
 *
 * @module repositories/admin
 */

const { pool } = require('../lib/db');

/**
 * Resumen general del panel administrativo.
 *
 * @returns {Promise<object>}
 */
async function resumen() {
    const [totales, estados, sectores, recientes, usuariosPorRol] = await Promise.all([
        pool.query(`
            SELECT
                (SELECT COUNT(*)::integer FROM usuarios) AS usuarios,
                (SELECT COUNT(*)::integer FROM usuarios WHERE activo = TRUE) AS usuarios_activos,
                (SELECT COUNT(*)::integer FROM reportes) AS reportes,
                (SELECT COUNT(*)::integer FROM reportes WHERE fecha >= CURRENT_DATE) AS reportes_hoy
        `),
        pool.query(`
            SELECT estado, COUNT(*)::integer AS total
            FROM reportes
            GROUP BY estado
        `),
        pool.query(`
            SELECT
                COALESCE(NULLIF(localidad, ''), 'Por geolocalizar') AS sector,
                COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE estado = 'pendiente')::integer AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'completado')::integer AS completados
            FROM reportes
            WHERE fecha >= NOW() - INTERVAL '15 days'
            GROUP BY COALESCE(NULLIF(localidad, ''), 'Por geolocalizar')
            ORDER BY total DESC
            LIMIT 12
        `),
        pool.query(`
            SELECT
                r.id,
                r.tipo,
                r.localidad,
                r.estado,
                r.fecha,
                u.nombre AS ciudadano,
                o.nombre AS operario
            FROM reportes r
            INNER JOIN usuarios u ON u.id = r.usuario_id
            LEFT JOIN usuarios o ON o.id = r.operario_id
            ORDER BY r.fecha DESC, r.id DESC
            LIMIT 8
        `),
        pool.query(`
            SELECT tipo_usuario, COUNT(*)::integer AS total
            FROM usuarios
            GROUP BY tipo_usuario
        `)
    ]);

    return {
        resumen: totales.rows[0],
        estados: estados.rows,
        sectores: sectores.rows,
        recientes: recientes.rows,
        usuarios_por_rol: usuariosPorRol.rows
    };
}

/**
 * Lista usuarios con su cantidad de reportes.
 *
 * @returns {Promise<object[]>}
 */
async function listarUsuarios() {
    const resultado = await pool.query(`
        SELECT
            u.id,
            u.nombre,
            u.correo,
            u.tipo_usuario,
            u.codigo_operario,
            u.zona_asignada,
            u.nit_empresa,
            u.activo,
            u.empresa_id,
            (u.codigo_verificacion_hash IS NOT NULL) AS tiene_codigo_verificacion,
            (SELECT e.nit FROM empresas e WHERE e.id = u.empresa_id) AS empresa_nit,
            COUNT(r.id)::integer AS reportes
        FROM usuarios u
        LEFT JOIN reportes r ON r.usuario_id = u.id
        GROUP BY u.id
        ORDER BY u.activo DESC, u.nombre
    `);

    return resultado.rows;
}

/**
 * Busca un usuario por correo normalizado.
 *
 * @param {string} correo
 * @param {number|null} [excluirId=null] - Usuario que no debe contar (edición).
 * @returns {Promise<object|null>}
 */
async function buscarUsuarioPorCorreo(correo, excluirId = null) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM usuarios
        WHERE LOWER(correo) = $1
          AND ($2::integer IS NULL OR id <> $2)
        LIMIT 1
        `,
        [correo, excluirId]
    );

    return resultado.rows[0] || null;
}

/**
 * Obtiene una empresa por id o por NIT.
 *
 * @param {{empresaId?: number|null, nit?: string|null}} [datos]
 * @returns {Promise<object|null>} Empresa encontrada.
 */
async function obtenerEmpresa({ empresaId = null, nit = null } = {}) {
    if (!empresaId && !nit) return null;

    const resultado = await pool.query(
        `
        SELECT id, nombre, nit, correo
        FROM empresas
        WHERE ($1::integer IS NOT NULL AND id = $1)
           OR ($2::text IS NOT NULL AND nit = $2)
        LIMIT 1
        `,
        [empresaId || null, nit ? String(nit).trim() : null]
    );

    return resultado.rows[0] || null;
}

/**
 * Actualiza el NIT de una empresa y sincroniza los códigos de sus
 * operarios dentro de una transacción.
 *
 * @param {number} empresaId
 * @param {{nombre: string, nit: string, correo: string}} datos
 * @returns {Promise<object|null>} Empresa actualizada.
 */
async function actualizarEmpresa(empresaId, datos) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const empresa = await client.query(
            `
            UPDATE empresas
            SET nombre = $1,
                nit = $2,
                correo = $3
            WHERE id = $4
            RETURNING id, nombre, nit, correo
            `,
            [datos.nombre, datos.nit, datos.correo, empresaId]
        );

        if (empresa.rowCount === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        /*
        Primero cambia el NIT y después los códigos. El trigger valida
        cada UPDATE de operario contra el NIT ya actualizado.
        */
        await client.query(
            `
            UPDATE usuarios
            SET codigo_operario = RIGHT(regexp_replace($1, '\\D', '', 'g'), 4)
            WHERE tipo_usuario = 'operario'
              AND empresa_id = $2
            `,
            [datos.nit, empresaId]
        );

        await client.query('COMMIT');
        return empresa.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Crea o actualiza la empresa asociada a una cuenta.
 *
 * @param {{nombre: string, nit: string, correo: string}} datos
 * @returns {Promise<number>} Id de la empresa.
 */
async function asegurarEmpresa(datos) {
    const resultado = await pool.query(
        `
        INSERT INTO empresas (nombre, nit, correo)
        VALUES ($1, $2, $3)
        ON CONFLICT (nit) DO UPDATE
        SET nombre = EXCLUDED.nombre
        RETURNING id
        `,
        [datos.nombre, datos.nit, datos.correo]
    );

    return resultado.rows[0].id;
}

/**
 * Inserta un usuario nuevo.
 *
 * @param {object} datos
 * @returns {Promise<object>}
 */
async function crearUsuario(datos) {
    const resultado = await pool.query(
        `
        INSERT INTO usuarios
            (nombre, correo, password, tipo_usuario, codigo_operario, zona_asignada, empresa_id, nit_empresa, codigo_verificacion_hash, codigo_verificacion_creado, activo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $9::text IS NULL THEN NULL ELSE NOW() END,TRUE)
        RETURNING id, nombre, correo, tipo_usuario, codigo_operario, zona_asignada, empresa_id, nit_empresa,
                  (codigo_verificacion_hash IS NOT NULL) AS tiene_codigo_verificacion, activo
        `,
        [
            datos.nombre,
            datos.correo,
            datos.passwordHash,
            datos.tipoUsuario,
            datos.codigoOperario,
            datos.zonaAsignada,
            datos.empresaId,
            datos.nitEmpresa,
            datos.codigoVerificacionHash || null
        ]
    );

    return resultado.rows[0];
}

/**
 * Obtiene los datos mínimos de un usuario para editarlo.
 *
 * @param {number} usuarioId
 * @returns {Promise<object|null>}
 */
async function obtenerTipoUsuario(usuarioId) {
    const resultado = await pool.query(
        `
        SELECT
            id,
            nombre,
            correo,
            tipo_usuario,
            codigo_operario,
            zona_asignada,
            empresa_id,
            nit_empresa,
            (codigo_verificacion_hash IS NOT NULL) AS tiene_codigo_verificacion
        FROM usuarios
        WHERE id = $1
        LIMIT 1
        `,
        [usuarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Actualiza los datos de un usuario que no sea administrador.
 *
 * @param {object} datos
 * @returns {Promise<object|null>}
 */
async function actualizarUsuario(datos) {
    const actualizarCodigo = datos.actualizarCodigoVerificacion === true;
    const codigoHash = datos.codigoVerificacionHash || null;

    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET nombre = $1,
            correo = $2,
            tipo_usuario = $3,
            codigo_operario = $4,
            zona_asignada = $5,
            empresa_id = $6,
            nit_empresa = $7,
            codigo_verificacion_hash = CASE
                WHEN $9::boolean THEN $10::text
                ELSE codigo_verificacion_hash
            END,
            codigo_verificacion_creado = CASE
                WHEN $9::boolean AND $10::text IS NOT NULL THEN NOW()
                WHEN $9::boolean THEN NULL
                ELSE codigo_verificacion_creado
            END
        WHERE id = $8
          AND tipo_usuario <> 'admin'
        RETURNING id, nombre, correo, tipo_usuario, codigo_operario, zona_asignada, empresa_id, nit_empresa,
                  (codigo_verificacion_hash IS NOT NULL) AS tiene_codigo_verificacion, activo
        `,
        [
            datos.nombre,
            datos.correo,
            datos.tipoUsuario,
            datos.codigoOperario,
            datos.zonaAsignada,
            datos.empresaId,
            datos.nitEmpresa,
            datos.usuarioId,
            actualizarCodigo,
            codigoHash
        ]
    );

    return resultado.rows[0] || null;
}

/**
 * Cambia la contraseña de un usuario que no sea administrador.
 *
 * @param {number} usuarioId
 * @param {string} passwordHash
 * @returns {Promise<object|null>}
 */
async function actualizarPassword(usuarioId, passwordHash) {
    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET password = $1
        WHERE id = $2
          AND tipo_usuario <> 'admin'
        RETURNING id, nombre
        `,
        [passwordHash, usuarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Elimina las sesiones activas de un usuario.
 *
 * @param {number} usuarioId
 * @returns {Promise<void>}
 */
async function eliminarSesiones(usuarioId) {
    await pool.query(
        'DELETE FROM sesiones WHERE usuario_id = $1',
        [usuarioId]
    );
}

/**
 * Activa o desactiva un usuario.
 *
 * @param {number} usuarioId
 * @param {boolean} activo
 * @returns {Promise<object|null>}
 */
async function actualizarActivo(usuarioId, activo) {
    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET activo = $1
        WHERE id = $2
        RETURNING id, nombre, correo, tipo_usuario, activo
        `,
        [activo, usuarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Guarda un código de verificación nuevo (solo operarios) y devuelve
 * los datos mínimos para notificar.
 *
 * @param {number} usuarioId
 * @param {string} codigoHash
 * @returns {Promise<object|null>}
 */
async function actualizarCodigoVerificacion(usuarioId, codigoHash) {
    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET codigo_verificacion_hash = $1,
            codigo_verificacion_creado = NOW()
        WHERE id = $2
          AND tipo_usuario = 'operario'
        RETURNING id, nombre, correo, empresa_id
        `,
        [codigoHash, usuarioId]
    );

    return resultado.rows[0] || null;
}

/**
 * Lista la configuración del sistema.
 *
 * @returns {Promise<object[]>}
 */
async function listarConfiguracion() {
    const resultado = await pool.query(`
        SELECT clave, valor, actualizado_at
        FROM configuracion_sistema
        ORDER BY clave
    `);

    return resultado.rows;
}

/**
 * Guarda una clave de configuración.
 *
 * @param {string} clave
 * @param {string} valor
 * @param {number} usuarioId
 * @returns {Promise<void>}
 */
async function guardarConfiguracion(clave, valor, usuarioId) {
    await pool.query(
        `
        INSERT INTO configuracion_sistema (clave, valor, actualizado_por, actualizado_at)
        VALUES ($1,$2,$3,NOW())
        ON CONFLICT (clave) DO UPDATE
        SET valor = EXCLUDED.valor,
            actualizado_por = EXCLUDED.actualizado_por,
            actualizado_at = NOW()
        `,
        [clave, valor, usuarioId]
    );
}

module.exports = {
    resumen,
    listarUsuarios,
    buscarUsuarioPorCorreo,
    asegurarEmpresa,
    obtenerEmpresa,
    actualizarEmpresa,
    crearUsuario,
    obtenerTipoUsuario,
    actualizarUsuario,
    actualizarPassword,
    actualizarCodigoVerificacion,
    eliminarSesiones,
    actualizarActivo,
    listarConfiguracion,
    guardarConfiguracion
};
