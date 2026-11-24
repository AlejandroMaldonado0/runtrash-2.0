/**
 * @file Acceso a datos del panel de entes de control.
 *
 * Encapsula las consultas SQL de resumen, reportes y seguimientos para
 * que las rutas se concentren en validar y responder.
 *
 * @module repositories/control
 */

const { pool } = require('../lib/db');

/**
 * Rol por el que se deben aislar los seguimientos.
 *
 * Cada ente de control (Distrito, Policía y SSPD) ve los reportes de
 * toda la ciudad, pero solo sus propios seguimientos. El administrador
 * conserva la vista global y recibe `null` para no filtrar. Si falta el
 * rol, se usa un valor imposible para fallar cerrado.
 *
 * @param {string} [ente] - Rol del usuario autenticado.
 * @returns {string|null} Rol a filtrar o `null` para visión global.
 */
function enteAislado(ente) {
    const rol = String(ente || '').trim();

    if (rol === 'admin') return null;

    return rol || 'ente-desconocido';
}

/**
 * Resumen agregado de reportes y seguimientos.
 *
 * Los totales de reportes son compartidos porque los tres entes
 * supervisan la ciudad completa. El conteo de seguimientos se limita al
 * ente solicitado para que sus métricas no mezclen la actividad de otros.
 *
 * @param {string} [ente] - Rol del ente de control.
 * @returns {Promise<object>} Totales, distribución por estado y localidad.
 */
async function resumen(ente) {
    const filtroEnte = enteAislado(ente);
    const filtroSql = filtroEnte ? 'WHERE ente = $1' : '';
    const filtroValores = filtroEnte ? [filtroEnte] : [];

    const [totales, porEstado, porLocalidad, seguimientos] = await Promise.all([
        pool.query(`
            SELECT
                COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE fecha::date = CURRENT_DATE)::integer AS hoy,
                COUNT(*) FILTER (WHERE estado = 'pendiente')::integer AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'en proceso')::integer AS en_proceso,
                COUNT(*) FILTER (WHERE estado = 'completado')::integer AS completados
            FROM reportes
        `),
        pool.query(`
            SELECT estado, COUNT(*)::integer AS total
            FROM reportes
            GROUP BY estado
        `),
        pool.query(`
            SELECT COALESCE(NULLIF(BTRIM(localidad), ''), 'Sin localidad') AS localidad,
                   COUNT(*)::integer AS total
            FROM reportes
            GROUP BY 1
            ORDER BY total DESC
            LIMIT 8
        `),
        pool.query(`
            SELECT
                COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE fecha > NOW() - INTERVAL '7 days')::integer AS ultima_semana
            FROM seguimientos_reportes
            ${filtroSql}
        `, filtroValores)
    ]);

    return {
        ...totales.rows[0],
        por_estado: porEstado.rows,
        por_localidad: porLocalidad.rows,
        seguimientos: seguimientos.rows[0]
    };
}

/**
 * Lista reportes con filtros opcionales y datos de seguimiento.
 *
 * @param {object} [filtros]
 * @param {string} [filtros.estado]
 * @param {string} [filtros.localidad]
 * @param {string} [filtros.desde]
 * @param {string} [filtros.hasta]
 * @param {string} [filtros.texto]
 * @param {string} [ente] - Rol del ente que consulta.
 * @returns {Promise<object[]>} Reportes encontrados.
 */
async function listarReportes(filtros = {}, ente) {
    const condiciones = [];
    const valores = [];

    const filtroEnte = enteAislado(ente);

    if (filtroEnte) {
        valores.push(filtroEnte);
    }

    /*
    El conteo y la fecha del último seguimiento se calculan solo sobre
    el ente que consulta. Así Policía no deduce la actividad de
    Distrito ni de SSPD a partir de los contadores.
    */
    const posEnte = valores.length;
    const condicionEnte = filtroEnte
        ? `AND s.ente = $${posEnte}`
        : '';

    const estado = String(filtros.estado || '').trim();
    if (estado) {
        valores.push(estado);
        condiciones.push(`r.estado = $${valores.length}`);
    }

    const localidad = String(filtros.localidad || '').trim();
    if (localidad) {
        valores.push(localidad);
        condiciones.push(`r.localidad = $${valores.length}`);
    }

    const desde = String(filtros.desde || '').trim();
    if (desde) {
        valores.push(desde);
        condiciones.push(`r.fecha >= $${valores.length}::date`);
    }

    const hasta = String(filtros.hasta || '').trim();
    if (hasta) {
        valores.push(hasta);
        condiciones.push(`r.fecha < ($${valores.length}::date + INTERVAL '1 day')`);
    }

    const texto = String(filtros.texto || '').trim();
    if (texto) {
        valores.push(`%${texto}%`);
        condiciones.push(`(
            r.tipo ILIKE $${valores.length}
            OR r.descripcion ILIKE $${valores.length}
            OR r.ubicacion ILIKE $${valores.length}
            OR u.nombre ILIKE $${valores.length}
        )`);
    }

    const where = condiciones.length
        ? `WHERE ${condiciones.join(' AND ')}`
        : '';

    const resultado = await pool.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano,
            o.nombre AS operario,
            e.nombre AS empresa,
            (
                SELECT COUNT(*)::integer
                FROM seguimientos_reportes s
                WHERE s.reporte_id = r.id
                ${condicionEnte}
            ) AS seguimientos,
            (
                SELECT MAX(s.fecha)
                FROM seguimientos_reportes s
                WHERE s.reporte_id = r.id
                ${condicionEnte}
            ) AS ultimo_seguimiento
        FROM reportes r
        INNER JOIN usuarios u ON u.id = r.usuario_id
        LEFT JOIN usuarios o ON o.id = r.operario_id
        LEFT JOIN empresas e ON e.id = o.empresa_id
        ${where}
        ORDER BY r.fecha DESC, r.id DESC
        `,
        valores
    );

    return resultado.rows;
}

/**
 * Obtiene el detalle de un reporte con ciudadano, operario y empresa.
 *
 * @param {number} reporteId
 * @returns {Promise<object|null>}
 */
async function obtenerReporte(reporteId) {
    const resultado = await pool.query(
        `
        SELECT
            r.*,
            u.nombre AS ciudadano,
            u.correo AS ciudadano_correo,
            o.nombre AS operario,
            o.correo AS operario_correo,
            e.nombre AS empresa
        FROM reportes r
        INNER JOIN usuarios u ON u.id = r.usuario_id
        LEFT JOIN usuarios o ON o.id = r.operario_id
        LEFT JOIN empresas e ON e.id = o.empresa_id
        WHERE r.id = $1
        `,
        [reporteId]
    );

    return resultado.rows[0] || null;
}

/**
 * Lista el historial de seguimientos de un reporte.
 *
 * Los entes de control solo reciben los seguimientos de su propio rol;
 * el administrador recibe el historial completo.
 *
 * @param {number} reporteId
 * @param {string} [ente] - Rol del ente que consulta.
 * @returns {Promise<object[]>}
 */
async function listarSeguimientos(reporteId, ente) {
    const filtroEnte = enteAislado(ente);
    const valores = [reporteId];
    const condicionEnte = filtroEnte ? 'AND s.ente = $2' : '';

    if (filtroEnte) {
        valores.push(filtroEnte);
    }

    const resultado = await pool.query(
        `
        SELECT
            s.id,
            s.ente,
            s.tipo,
            s.mensaje,
            s.estado_reportado,
            s.fecha,
            COALESCE(us.nombre, 'Cuenta eliminada') AS autor
        FROM seguimientos_reportes s
        LEFT JOIN usuarios us ON us.id = s.usuario_id
        WHERE s.reporte_id = $1
        ${condicionEnte}
        ORDER BY s.fecha DESC, s.id DESC
        `,
        valores
    );

    return resultado.rows;
}

/**
 * Busca los datos mínimos de un reporte para registrar seguimiento.
 *
 * @param {number} reporteId
 * @returns {Promise<object|null>}
 */
async function buscarReporteBasico(reporteId) {
    const resultado = await pool.query(
        'SELECT id, estado, operario_id, usuario_id FROM reportes WHERE id = $1 LIMIT 1',
        [reporteId]
    );

    return resultado.rows[0] || null;
}

/**
 * Inserta un seguimiento y devuelve la fila creada.
 *
 * @param {object} datos
 * @param {number} datos.reporteId
 * @param {number} datos.usuarioId
 * @param {string} datos.ente
 * @param {string} datos.tipo
 * @param {string} datos.mensaje
 * @param {string} datos.estadoReportado
 * @returns {Promise<object>}
 */
async function crearSeguimiento(datos) {
    const resultado = await pool.query(
        `
        INSERT INTO seguimientos_reportes
            (reporte_id, usuario_id, ente, tipo, mensaje, estado_reportado)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, ente, tipo, mensaje, estado_reportado, fecha
        `,
        [
            datos.reporteId,
            datos.usuarioId,
            datos.ente,
            datos.tipo,
            datos.mensaje,
            datos.estadoReportado
        ]
    );

    return resultado.rows[0];
}

module.exports = {
    enteAislado,
    resumen,
    listarReportes,
    obtenerReporte,
    listarSeguimientos,
    buscarReporteBasico,
    crearSeguimiento
};
