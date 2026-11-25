/**
 * @file Acceso a datos de autenticación y recuperación de contraseña.
 *
 * Las funciones que participan en una transacción reciben el cliente
 * de PostgreSQL como primer argumento para que la ruta mantenga el
 * control de `BEGIN`/`COMMIT`/`ROLLBACK`.
 *
 * @module repositories/auth
 */

const { pool } = require('../lib/db');

/**
 * Busca un usuario por correo (solo id).
 *
 * @param {string} correo
 * @returns {Promise<object|null>}
 */
async function buscarPorCorreo(correo) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM usuarios
        WHERE LOWER(correo) = $1
        LIMIT 1
        `,
        [correo]
    );

    return resultado.rows[0] || null;
}

/**
 * Busca un operario por código.
 *
 * @param {string} codigo
 * @returns {Promise<object|null>}
 */
async function buscarPorCodigoOperario(codigo) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM usuarios
        WHERE codigo_operario = $1
        LIMIT 1
        `,
        [codigo]
    );

    return resultado.rows[0] || null;
}

/**
 * Comprueba si un NIT ya existe en empresas o usuarios.
 *
 * @param {string} nit
 * @returns {Promise<object|null>}
 */
async function buscarPorNit(nit) {
    const resultado = await pool.query(
        `
        SELECT id
        FROM empresas
        WHERE nit = $1
        UNION ALL
        SELECT id
        FROM usuarios
        WHERE nit_empresa = $1
        LIMIT 1
        `,
        [nit]
    );

    return resultado.rows[0] || null;
}

/**
 * Inserta la empresa dentro de una transacción.
 *
 * @param {import('pg').PoolClient} client
 * @param {{nombre: string, nit: string, correo: string}} datos
 * @returns {Promise<number>}
 */
async function crearEmpresa(client, datos) {
    const resultado = await client.query(
        `
        INSERT INTO empresas (nombre, nit, correo)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [datos.nombre, datos.nit, datos.correo]
    );

    return resultado.rows[0].id;
}

/**
 * Inserta el usuario dentro de una transacción.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} datos
 * @returns {Promise<object>}
 */
async function crearUsuario(client, datos) {
    const resultado = await client.query(
        `
        INSERT INTO usuarios
        (
            nombre,
            correo,
            password,
            tipo_usuario,
            codigo_operario,
            zona_asignada,
            empresa_id,
            nit_empresa,
            fecha_nacimiento
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING
            id,
            nombre,
            correo,
            tipo_usuario,
            codigo_operario,
            zona_asignada,
            empresa_id,
            nit_empresa,
            activo,
            fecha_nacimiento
        `,
        [
            datos.nombre,
            datos.correo,
            datos.passwordHash,
            datos.tipoUsuario,
            datos.codigoOperativo,
            datos.zonaAsignada,
            datos.empresaId,
            datos.nitEmpresa,
            datos.fechaNacimiento || null
        ]
    );

    return resultado.rows[0];
}

/**
 * Obtiene el usuario completo para validar el login.
 *
 * @param {string} correo
 * @returns {Promise<object|null>}
 */
async function buscarUsuarioLogin(correo) {
    const resultado = await pool.query(
        `
        SELECT
            u.id,
            u.nombre,
            u.correo,
            u.password,
            u.tipo_usuario,
            u.codigo_operario,
            u.zona_asignada,
            u.empresa_id,
            u.nit_empresa,
            u.avatar_url,
            u.fecha_registro,
            u.fecha_nacimiento,
            u.activo,
            u.intentos_fallidos,
            u.bloqueado_hasta,
            u.codigo_verificacion_hash,
            e.nit AS empresa_nit
        FROM usuarios u
        LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE LOWER(u.correo) = $1
        LIMIT 1
        `,
        [correo]
    );

    return resultado.rows[0] || null;
}

/**
 * Suma un intento fallido y bloquea la cuenta tras cinco errores.
 *
 * El bloqueo es temporal (15 minutos) para no dejar cuentas
 * permanentemente inutilizables por un ataque de fuerza bruta.
 *
 * @param {number} usuarioId
 * @returns {Promise<{intentos_fallidos: number, bloqueado_hasta: Date|null}>}
 */
async function registrarIntentoFallido(usuarioId) {
    const resultado = await pool.query(
        `
        UPDATE usuarios
        SET intentos_fallidos = intentos_fallidos + 1,
            bloqueado_hasta = CASE
                WHEN intentos_fallidos + 1 >= 5
                    THEN NOW() + INTERVAL '15 minutes'
                ELSE bloqueado_hasta
            END
        WHERE id = $1
        RETURNING intentos_fallidos, bloqueado_hasta
        `,
        [usuarioId]
    );

    return resultado.rows[0] || {
        intentos_fallidos: 0,
        bloqueado_hasta: null
    };
}

/**
 * Reinicia el contador de intentos después de un login correcto.
 *
 * @param {number} usuarioId
 * @returns {Promise<void>}
 */
async function limpiarIntentos(usuarioId) {
    await pool.query(
        `
        UPDATE usuarios
        SET intentos_fallidos = 0,
            bloqueado_hasta = NULL
        WHERE id = $1
        `,
        [usuarioId]
    );
}

/**
 * Crea una sesión.
 *
 * @param {number} usuarioId
 * @param {string} tokenHash
 * @param {number} horas
 * @returns {Promise<void>}
 */
async function crearSesion(usuarioId, tokenHash, horas) {
    await pool.query(
        `
        INSERT INTO sesiones
            (usuario_id, token, expira)
        VALUES
            ($1, $2, NOW() + ($3 * INTERVAL '1 hour'))
        `,
        [usuarioId, tokenHash, horas]
    );
}

/**
 * Elimina una sesión por hash de token.
 *
 * @param {string} tokenHash
 * @returns {Promise<void>}
 */
async function eliminarSesion(tokenHash) {
    await pool.query(
        'DELETE FROM sesiones WHERE token = $1',
        [tokenHash]
    );
}

/**
 * Obtiene el hash de contraseña actual de un usuario.
 *
 * @param {number} usuarioId
 * @returns {Promise<string>}
 */
async function obtenerPassword(usuarioId) {
    const resultado = await pool.query(
        `
        SELECT password
        FROM usuarios
        WHERE id = $1
          AND activo = TRUE
        `,
        [usuarioId]
    );

    return resultado.rows[0]?.password || '';
}

/**
 * Actualiza la contraseña de un usuario.
 *
 * @param {number} usuarioId
 * @param {string} passwordHash
 * @returns {Promise<void>}
 */
async function actualizarPassword(usuarioId, passwordHash) {
    await pool.query(
        'UPDATE usuarios SET password = $1 WHERE id = $2',
        [passwordHash, usuarioId]
    );
}

/**
 * Elimina todas las sesiones de un usuario.
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
 * Busca la cuenta para iniciar recuperación de contraseña.
 *
 * @param {string} correo
 * @returns {Promise<object|null>}
 */
async function buscarUsuarioRecuperacion(correo) {
    const resultado = await pool.query(
        `
        SELECT id, nombre, correo, activo
        FROM usuarios
        WHERE LOWER(correo) = $1
        LIMIT 1
        `,
        [correo]
    );

    return resultado.rows[0] || null;
}

/**
 * Invalida los códigos de recuperación pendientes.
 *
 * @param {number} usuarioId
 * @returns {Promise<void>}
 */
async function invalidarRecuperaciones(usuarioId) {
    await pool.query(
        `
        UPDATE password_recuperaciones
        SET usado = TRUE
        WHERE usuario_id = $1 AND usado = FALSE
        `,
        [usuarioId]
    );
}

/**
 * Crea un código de recuperación.
 *
 * @param {number} usuarioId
 * @param {string} codigoHash
 * @param {number} minutos
 * @returns {Promise<void>}
 */
async function crearRecuperacion(usuarioId, codigoHash, minutos) {
    await pool.query(
        `
        INSERT INTO password_recuperaciones
            (usuario_id, codigo_hash, expira)
        VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)
        `,
        [usuarioId, codigoHash, String(minutos)]
    );
}

/**
 * Obtiene el código de recuperación vigente más reciente.
 *
 * @param {string} correo
 * @returns {Promise<object|null>}
 */
async function buscarRecuperacion(correo) {
    const resultado = await pool.query(
        `
        SELECT r.id, r.codigo_hash, r.expira, r.intentos
        FROM password_recuperaciones r
        JOIN usuarios u ON u.id = r.usuario_id
        WHERE LOWER(u.correo) = $1
          AND r.usado = FALSE
        ORDER BY r.creado_en DESC
        LIMIT 1
        `,
        [correo]
    );

    return resultado.rows[0] || null;
}

/**
 * Suma un intento fallido al código de recuperación.
 *
 * @param {number} recuperacionId
 * @returns {Promise<void>}
 */
async function incrementarIntentos(recuperacionId) {
    await pool.query(
        'UPDATE password_recuperaciones SET intentos = intentos + 1 WHERE id = $1',
        [recuperacionId]
    );
}

/**
 * Obtiene el id de un usuario por correo.
 *
 * @param {string} correo
 * @returns {Promise<object|null>}
 */
async function buscarIdPorCorreo(correo) {
    const resultado = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(correo) = $1 LIMIT 1',
        [correo]
    );

    return resultado.rows[0] || null;
}

/**
 * Guarda un código de un solo uso para completar un ingreso OAuth.
 *
 * @param {number} usuarioId - Cuenta autenticada por el proveedor.
 * @param {string} codigoHash - Hash SHA-256 del código entregado al navegador.
 * @param {number} minutos - Vigencia en minutos.
 * @returns {Promise<void>}
 */
async function crearCodigoOAuth(usuarioId, codigoHash, minutos) {
    await pool.query(
        `
        INSERT INTO oauth_codigos (codigo_hash, usuario_id, expira)
        VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))
        `,
        [codigoHash, usuarioId, minutos]
    );
}

/**
 * Canjea un código OAuth y devuelve la cuenta asociada.
 *
 * La actualización marca el código como usado en la misma sentencia,
 * así que dos peticiones simultáneas no pueden usar el mismo código.
 *
 * @param {string} codigoHash - Hash del código recibido.
 * @returns {Promise<object|null>} Usuario o `null` si no es válido.
 */
async function canjearCodigoOAuth(codigoHash) {
    const resultado = await pool.query(
        `
        WITH canje AS (
            UPDATE oauth_codigos
            SET usado = TRUE
            WHERE codigo_hash = $1
              AND usado = FALSE
              AND expira > NOW()
            RETURNING usuario_id
        )
        SELECT
            u.id,
            u.nombre,
            u.correo,
            u.tipo_usuario,
            u.codigo_operario,
            u.zona_asignada,
            u.empresa_id,
            u.nit_empresa,
            u.avatar_url,
            u.fecha_registro,
            u.activo,
            e.nit AS empresa_nit
        FROM canje c
        INNER JOIN usuarios u ON u.id = c.usuario_id
        LEFT JOIN empresas e ON e.id = u.empresa_id
        `,
        [codigoHash]
    );

    return resultado.rows[0] || null;
}

/**
 * Marca un código de recuperación como usado.
 *
 * @param {number} recuperacionId
 * @returns {Promise<void>}
 */
async function marcarRecuperacionUsada(recuperacionId) {
    await pool.query(
        'UPDATE password_recuperaciones SET usado = TRUE WHERE id = $1',
        [recuperacionId]
    );
}

module.exports = {
    buscarPorCorreo,
    buscarPorCodigoOperario,
    buscarPorNit,
    crearEmpresa,
    crearUsuario,
    buscarUsuarioLogin,
    registrarIntentoFallido,
    limpiarIntentos,
    crearSesion,
    eliminarSesion,
    obtenerPassword,
    actualizarPassword,
    eliminarSesiones,
    buscarUsuarioRecuperacion,
    invalidarRecuperaciones,
    crearRecuperacion,
    buscarRecuperacion,
    incrementarIntentos,
    buscarIdPorCorreo,
    marcarRecuperacionUsada,
    crearCodigoOAuth,
    canjearCodigoOAuth
};
