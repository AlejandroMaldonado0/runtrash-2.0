/**
 * @file Verificación dinámica de la matriz de seguridad.
 *
 * Comprueba contra un servidor local (`http://localhost:3000`) los
 * controles añadidos en el endurecimiento: autorregistro restringido,
 * segundo factor, tokens por query limitados, tenancy de reportes e
 * imágenes, CORS, caché y el trigger del código de operario.
 *
 * Uso:
 *   node scripts/verificar-seguridad.mjs
 *
 * No ejecuta ataques destructivos: solo pruebas de autorización y una
 * transacción con ROLLBACK para validar el trigger.
 *
 * @module scripts/verificar-seguridad
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;
const DIRECTORIO = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
    path: path.join(DIRECTORIO, '..', '.env'),
    quiet: true
});

const BASE = process.env.RUNTRASH_URL || 'http://localhost:3000';
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'Runtrash',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
});

const resultados = [];

/**
 * Guarda una comprobación para la tabla final.
 *
 * @param {string} nombre - Descripción corta.
 * @param {boolean} ok - Resultado.
 * @param {string} [detalle=''] - Contexto del resultado.
 * @returns {void}
 */
function registrar(nombre, ok, detalle = '') {
    resultados.push({ nombre, ok, detalle });
}

/**
 * Ejecuta una petición JSON contra la API.
 *
 * @param {string} ruta - Ruta relativa o absoluta.
 * @param {object} [opciones] - Opciones de `fetch`.
 * @returns {Promise<{status: number, headers: Headers, body: object}>}
 */
async function pedir(ruta, opciones = {}) {
    const respuesta = await fetch(
        ruta.startsWith('http') ? ruta : `${BASE}${ruta}`,
        {
            ...opciones,
            headers: {
                ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
                ...(opciones.headers || {})
            }
        }
    );

    let body = null;

    try {
        body = await respuesta.json();
    } catch {
        body = null;
    }

    return { status: respuesta.status, headers: respuesta.headers, body };
}

/**
 * Inicia sesión y devuelve el token.
 *
 * @param {string} correo - Correo de la cuenta.
 * @param {string} password - Contraseña.
 * @param {object} [extra] - Segundo factor (NIT o código).
 * @returns {Promise<{status: number, token: string|null, body: object}>}
 */
async function iniciarSesion(correo, password, extra = {}) {
    const respuesta = await pedir('/api/login', {
        method: 'POST',
        body: JSON.stringify({ correo, password, ...extra })
    });

    return {
        status: respuesta.status,
        token: respuesta.body?.token || null,
        body: respuesta.body
    };
}

/**
 * Cabecera Authorization para una sesión.
 *
 * @param {string} token - Token de sesión.
 * @returns {object} Encabezados HTTP.
 */
function autorizacion(token) {
    return { Authorization: `Bearer ${token}` };
}

const CIUDADANO = 'ui.ciudadano@runtrash.test';
const EMPRESA = 'ui.empresa@runtrash.test';
const OPERARIO = 'ui.operario@runtrash.test';
const ADMIN = 'admin.prueba@runtrash.test';
const DISTRITO = 'distrito@runtrash.test';
const POLICIA = 'policia@runtrash.test';
const PASSWORD_UI = 'UiTest2026!';
const PASSWORD_CONTROL = 'RunTrash2026!';

try {
    /*
    Se limpian los intentos fallidos de las cuentas de prueba para que
    la verificación sea repetible aunque una ejecución anterior haya
    dejado un bloqueo temporal.
    */
    await pool.query(
        `
        UPDATE usuarios
        SET intentos_fallidos = 0,
            bloqueado_hasta = NULL,
            codigo_verificacion_hash = NULL,
            codigo_verificacion_creado = NULL
        WHERE LOWER(correo) = ANY($1::text[])
        `,
        [[CIUDADANO, EMPRESA, OPERARIO, DISTRITO, POLICIA]]
    );

    // ---------- Autorregistro ----------
    const registroEmpresa = await pedir('/api/registro', {
        method: 'POST',
        body: JSON.stringify({
            nombre: 'Empresa Intrusa',
            correo: 'intrusa@runtrash.test',
            password: 'Intrusa2026!',
            tipo_usuario: 'empresa',
            nit_empresa: '900999999-1'
        })
    });
    registrar(
        'registro público de empresa rechazado',
        registroEmpresa.status === 403 && registroEmpresa.body?.ok === false,
        `HTTP ${registroEmpresa.status}`
    );

    const registroOperario = await pedir('/api/registro', {
        method: 'POST',
        body: JSON.stringify({
            nombre: 'Operario Intruso',
            correo: 'operario.intruso@runtrash.test',
            password: 'Intruso2026!',
            tipo_usuario: 'operario',
            codigo_operario: '4567'
        })
    });
    registrar(
        'registro público de operario rechazado',
        registroOperario.status === 403,
        `HTTP ${registroOperario.status}`
    );

    // ---------- Segundo factor ----------
    const sinCodigo = await iniciarSesion(OPERARIO, PASSWORD_UI);
    registrar(
        'operario exige código',
        sinCodigo.status === 400,
        `HTTP ${sinCodigo.status}`
    );

    const codigoMalo = await iniciarSesion(OPERARIO, PASSWORD_UI, {
        codigo_operario: '0000'
    });
    registrar(
        'operario con código incorrecto rechazado',
        codigoMalo.status === 401,
        `HTTP ${codigoMalo.status}`
    );

    const nitMalo = await iniciarSesion(EMPRESA, PASSWORD_UI, {
        nit_empresa: '111111111-1'
    });
    registrar(
        'empresa con NIT incorrecto rechazada',
        nitMalo.status === 401,
        `HTTP ${nitMalo.status}`
    );

    const sinVerificacion = await iniciarSesion(OPERARIO, PASSWORD_UI, {
        codigo_operario: '4567'
    });
    registrar(
        'operario sin código de verificación no puede entrar',
        sinVerificacion.status === 403,
        `HTTP ${sinVerificacion.status}`
    );

    const empresa = await iniciarSesion(EMPRESA, PASSWORD_UI, {
        nit_empresa: '900123456-7'
    });
    registrar(
        'empresa entra con su NIT',
        empresa.status === 200 && Boolean(empresa.token),
        `HTTP ${empresa.status}`
    );

    // ---------- Código de verificación que entrega la empresa ----------
    const operarioDb = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(correo) = LOWER($1) LIMIT 1',
        [OPERARIO]
    );
    const operarioId = Number(operarioDb.rows[0]?.id);

    if (empresa.token && operarioId) {
        const generacion = await pedir(
            `/api/operarios/${operarioId}/codigo-verificacion`,
            { method: 'POST', headers: autorizacion(empresa.token) }
        );
        const codigoVerificacion = generacion.body?.codigo_verificacion;

        registrar(
            'la empresa genera un código de verificación para su operario',
            generacion.status === 200
                && /^\d{6}$/.test(String(codigoVerificacion || '')),
            `HTTP ${generacion.status}`
        );

        const verificacionMala = await iniciarSesion(OPERARIO, PASSWORD_UI, {
            codigo_operario: '4567',
            codigo_verificacion: '000000'
        });
        registrar(
            'operario con código de verificación incorrecto rechazado',
            verificacionMala.status === 401,
            `HTTP ${verificacionMala.status}`
        );

        const conVerificacion = await iniciarSesion(OPERARIO, PASSWORD_UI, {
            codigo_operario: '4567',
            codigo_verificacion: codigoVerificacion
        });
        registrar(
            'operario entra con el código de verificación de su empresa',
            conVerificacion.status === 200 && Boolean(conVerificacion.token),
            `HTTP ${conVerificacion.status}`
        );
    } else {
        registrar(
            'la empresa genera un código de verificación para su operario',
            false,
            'no se pudo iniciar sesión como empresa u operario'
        );
    }

    const admin = await iniciarSesion(ADMIN, 'Admin2026!');
    const ciudadano = await iniciarSesion(CIUDADANO, PASSWORD_UI);
    registrar(
        'administrador y ciudadano inician sesión',
        Boolean(admin.token) && Boolean(ciudadano.token),
        `admin ${admin.status}, ciudadano ${ciudadano.status}`
    );

    // ---------- Aislamiento entre entes de control ----------
    const distrito = await iniciarSesion(DISTRITO, PASSWORD_CONTROL);
    const policia = await iniciarSesion(POLICIA, PASSWORD_CONTROL);

    registrar(
        'distrito y policía inician sesión',
        Boolean(distrito.token) && Boolean(policia.token),
        `distrito ${distrito.status}, policía ${policia.status}`
    );

    if (distrito.token && policia.token) {
        const reporteObjetivo = await pool.query(
            'SELECT id FROM reportes ORDER BY id DESC LIMIT 1'
        );
        const reporteId = reporteObjetivo.rows[0]?.id;

        if (!reporteId) {
            registrar(
                'aislamiento de seguimientos entre entes',
                true,
                'sin reportes de muestra'
            );
        } else {
            const marcador = `Aislamiento entre entes ${Date.now()}`;
            let seguimientoId = null;

            try {
                const creacion = await pedir(
                    `/api/control/reportes/${reporteId}/seguimiento`,
                    {
                        method: 'POST',
                        headers: autorizacion(distrito.token),
                        body: JSON.stringify({
                            tipo: 'observacion',
                            mensaje: marcador
                        })
                    }
                );

                seguimientoId = creacion.body?.seguimiento?.id || null;
                registrar(
                    'distrito registra su propio seguimiento',
                    creacion.status === 201 && Boolean(seguimientoId),
                    `HTTP ${creacion.status}`
                );

                const detallePolicia = await pedir(
                    `/api/control/reportes/${reporteId}`,
                    { headers: autorizacion(policia.token) }
                );
                const idsPolicia = (detallePolicia.body?.seguimientos || [])
                    .map((item) => Number(item.id));
                registrar(
                    'policía no ve los seguimientos del distrito',
                    detallePolicia.status === 200
                        && seguimientoId !== null
                        && !idsPolicia.includes(Number(seguimientoId)),
                    `HTTP ${detallePolicia.status}, ${idsPolicia.length} seguimiento(s)`
                );

                const detalleDistrito = await pedir(
                    `/api/control/reportes/${reporteId}`,
                    { headers: autorizacion(distrito.token) }
                );
                const idsDistrito = (detalleDistrito.body?.seguimientos || [])
                    .map((item) => Number(item.id));
                registrar(
                    'distrito sí ve su propio seguimiento',
                    detalleDistrito.status === 200
                        && seguimientoId !== null
                        && idsDistrito.includes(Number(seguimientoId)),
                    `HTTP ${detalleDistrito.status}, ${idsDistrito.length} seguimiento(s)`
                );

                const detalleAdmin = await pedir(
                    `/api/control/reportes/${reporteId}`,
                    { headers: autorizacion(admin.token) }
                );
                const idsAdmin = (detalleAdmin.body?.seguimientos || [])
                    .map((item) => Number(item.id));
                registrar(
                    'el administrador ve el historial completo',
                    detalleAdmin.status === 200
                        && seguimientoId !== null
                        && idsAdmin.includes(Number(seguimientoId)),
                    `HTTP ${detalleAdmin.status}, ${idsAdmin.length} seguimiento(s)`
                );

                const cuenta = await pool.query(
                    `
                    SELECT ente, COUNT(*)::integer AS total
                    FROM seguimientos_reportes
                    WHERE ente IN ('distrito', 'policia')
                    GROUP BY ente
                    `
                );
                const totales = Object.fromEntries(
                    cuenta.rows.map((fila) => [fila.ente, fila.total])
                );

                const resumenPolicia = await pedir('/api/control/resumen', {
                    headers: autorizacion(policia.token)
                });
                registrar(
                    'el resumen de policía solo cuenta sus seguimientos',
                    resumenPolicia.status === 200
                        && Number(resumenPolicia.body?.resumen?.seguimientos?.total)
                            === Number(totales.policia || 0),
                    `${resumenPolicia.body?.resumen?.seguimientos?.total ?? '?'} vs ${
                        totales.policia || 0
                    }`
                );

                const resumenDistrito = await pedir('/api/control/resumen', {
                    headers: autorizacion(distrito.token)
                });
                registrar(
                    'el resumen de distrito solo cuenta sus seguimientos',
                    resumenDistrito.status === 200
                        && Number(resumenDistrito.body?.resumen?.seguimientos?.total)
                            === Number(totales.distrito || 0),
                    `${resumenDistrito.body?.resumen?.seguimientos?.total ?? '?'} vs ${
                        totales.distrito || 0
                    }`
                );

                const listadoPolicia = await pedir('/api/control/reportes', {
                    headers: autorizacion(policia.token)
                });
                const filaPolicia = (listadoPolicia.body?.reportes || [])
                    .find((fila) => Number(fila.id) === Number(reporteId));
                const cuentaPoliciaReporte = await pool.query(
                    `
                    SELECT COUNT(*)::integer AS total
                    FROM seguimientos_reportes
                    WHERE reporte_id = $1 AND ente = 'policia'
                    `,
                    [reporteId]
                );
                registrar(
                    'el listado de policía cuenta solo sus seguimientos',
                    listadoPolicia.status === 200
                        && Number(filaPolicia?.seguimientos)
                            === Number(cuentaPoliciaReporte.rows[0].total),
                    `${filaPolicia?.seguimientos ?? '?'} vs ${
                        cuentaPoliciaReporte.rows[0].total
                    }`
                );
            } finally {
                if (seguimientoId) {
                    await pool.query(
                        `
                        DELETE FROM notificaciones
                        WHERE referencia_tipo = 'reporte'
                          AND referencia_id = $1
                          AND tipo = 'seguimiento'
                          AND mensaje LIKE $2
                        `,
                        [reporteId, `%${marcador}%`]
                    );
                    await pool.query(
                        'DELETE FROM seguimientos_reportes WHERE id = $1',
                        [seguimientoId]
                    );
                }
            }
        }
    }

    // ---------- Token por query ----------
    const meQuery = await pedir(`/api/me?token=${ciudadano.token}`);
    registrar(
        'token por query rechazado fuera de SSE/uploads',
        meQuery.status === 401,
        `HTTP ${meQuery.status}`
    );

    const meHeader = await pedir('/api/me', {
        headers: autorizacion(ciudadano.token)
    });
    registrar(
        'token por cabecera aceptado',
        meHeader.status === 200 && meHeader.body?.usuario?.correo === CIUDADANO,
        `HTTP ${meHeader.status}`
    );

    const controladorSse = new AbortController();

    try {
        const sse = await fetch(
            `${BASE}/api/eventos?token=${encodeURIComponent(ciudadano.token)}`,
            { signal: controladorSse.signal }
        );
        registrar(
            'SSE acepta token por query',
            sse.status === 200
                && String(sse.headers.get('content-type')).includes('text/event-stream'),
            `HTTP ${sse.status}`
        );
    } catch (error) {
        registrar('SSE acepta token por query', false, error.message);
    } finally {
        controladorSse.abort();
    }

    const imagen = await pool.query(`
        SELECT r.imagen_url
        FROM reportes r
        WHERE r.imagen_url IS NOT NULL
        ORDER BY r.id DESC
        LIMIT 1
    `);
    const claveImagen = imagen.rows[0]?.imagen_url?.replace('/uploads/', '');

    if (claveImagen) {
        const sinToken = await pedir(
            `/uploads/${claveImagen.split('/').map(encodeURIComponent).join('/')}`
        );
        registrar(
            'las imágenes exigen sesión',
            sinToken.status === 401,
            `HTTP ${sinToken.status}`
        );

        const conToken = await fetch(
            `${BASE}/uploads/${claveImagen.split('/').map(encodeURIComponent).join('/')}`
            + `?token=${encodeURIComponent(admin.token)}`
        );
        registrar(
            'las imágenes aceptan token por query',
            conToken.status !== 401,
            `HTTP ${conToken.status}`
        );
    } else {
        registrar('las imágenes exigen sesión', true, 'sin imágenes de muestra');
    }

    // ---------- CORS y caché ----------
    const corsMalo = await pedir('/api/prueba', {
        headers: { Origin: 'https://evil.example' }
    });
    registrar(
        'CORS rechaza orígenes ajenos',
        corsMalo.status === 403
            && !corsMalo.headers.get('access-control-allow-origin'),
        `HTTP ${corsMalo.status}`
    );

    const corsPropio = await pedir('/api/prueba', {
        headers: { Origin: 'http://localhost:3000' }
    });
    registrar(
        'CORS permite el mismo origen',
        corsPropio.status === 200
            && corsPropio.headers.get('access-control-allow-origin') === 'http://localhost:3000',
        `HTTP ${corsPropio.status}`
    );

    registrar(
        'la API responde con Cache-Control no-store',
        meHeader.headers.get('cache-control') === 'no-store',
        meHeader.headers.get('cache-control') || 'sin cabecera'
    );

    // ---------- Tenancy de reportes ----------
    const reportesEmpresa = await pedir('/api/reportes', {
        headers: autorizacion(empresa.token)
    });
    const idsEmpresa = (reportesEmpresa.body?.reportes || [])
        .map((reporte) => reporte.id)
        .sort((a, b) => a - b);

    const visibles = await pool.query(
        `
        SELECT r.id
        FROM reportes r
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
        ORDER BY r.id
        `,
        [Number(empresa.body?.usuario?.empresa_id)]
    );
    const idsEsperados = visibles.rows.map((fila) => fila.id);

    registrar(
        'la empresa solo recibe reportes de su ámbito',
        reportesEmpresa.status === 200
            && JSON.stringify(idsEmpresa) === JSON.stringify(idsEsperados),
        `HTTP ${reportesEmpresa.status}, ${idsEmpresa.length} reporte(s)`
    );

    const reportesAdmin = await pedir('/api/reportes', {
        headers: autorizacion(admin.token)
    });
    registrar(
        'el administrador conserva visión global',
        reportesAdmin.status === 200
            && (reportesAdmin.body?.reportes || []).length >= idsEmpresa.length,
        `HTTP ${reportesAdmin.status}`
    );

    const ajeno = await pool.query(
        `
        SELECT r.imagen_url
        FROM reportes r
        LEFT JOIN usuarios o ON o.id = r.operario_id
        WHERE r.imagen_url IS NOT NULL
          AND NOT (
                o.empresa_id = $1
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
          )
        ORDER BY r.id DESC
        LIMIT 1
        `,
        [Number(empresa.body?.usuario?.empresa_id)]
    );

    if (ajeno.rows[0]?.imagen_url) {
        const claveAjena = ajeno.rows[0].imagen_url.replace('/uploads/', '');
        const respuestaImagen = await pedir(
            `/uploads/${claveAjena.split('/').map(encodeURIComponent).join('/')}`,
            { headers: autorizacion(empresa.token) }
        );
        registrar(
            'la empresa no ve imágenes de otro ámbito',
            respuestaImagen.status === 403,
            `HTTP ${respuestaImagen.status}`
        );
    } else {
        registrar(
            'la empresa no ve imágenes de otro ámbito',
            true,
            'sin imágenes ajenas de muestra'
        );
    }

    const reporteAjeno = await pool.query(
        `
        SELECT r.id
        FROM reportes r
        WHERE r.usuario_id <> $1
        ORDER BY r.id DESC
        LIMIT 1
        `,
        [Number(ciudadano.body?.usuario?.id)]
    );

    if (reporteAjeno.rows[0]) {
        const consulta = await pedir(
            `/api/reportes/usuario/${reporteAjeno.rows[0].id}`,
            { headers: autorizacion(ciudadano.token) }
        );
        registrar(
            'un ciudadano no puede leer reportes de otro',
            consulta.status === 403,
            `HTTP ${consulta.status}`
        );
    }

    // ---------- Alta de operarios por empresa ----------
    const correoTemporal = `tenancy.${Date.now()}@runtrash.test`;
    let operarioTemporalId = null;

    try {
        const creacion = await pedir('/api/operarios', {
            method: 'POST',
            headers: autorizacion(empresa.token),
            body: JSON.stringify({
                nombre: 'Operario de prueba de tenancy',
                correo: correoTemporal,
                password: 'Tenancy2026!',
                zona_asignada: 'Usaquén',
                nit_empresa: '123456789'
            })
        });

        if (creacion.status === 201) {
            operarioTemporalId = creacion.body?.usuario?.id;

            const fila = await pool.query(
                `
                SELECT empresa_id, codigo_operario
                FROM usuarios
                WHERE id = $1
                `,
                [operarioTemporalId]
            );

            const empresaEsperada = Number(empresa.body?.usuario?.empresa_id);

            registrar(
                'la empresa no crea operarios en otra empresa',
                fila.rows[0]?.empresa_id === empresaEsperada
                    && fila.rows[0]?.codigo_operario === '4567',
                `empresa ${fila.rows[0]?.empresa_id}, código ${
                    fila.rows[0]?.codigo_operario
                }`
            );
        } else {
            registrar(
                'la empresa no crea operarios en otra empresa',
                false,
                `HTTP ${creacion.status}`
            );
        }
    } finally {
        if (operarioTemporalId) {
            await pool.query(
                'DELETE FROM sesiones WHERE usuario_id = $1',
                [operarioTemporalId]
            );
            await pool.query(
                'DELETE FROM usuarios WHERE id = $1',
                [operarioTemporalId]
            );
        }
    }

    // ---------- Trigger del código de operario ----------
    const cliente = await pool.connect();

    try {
        await cliente.query('BEGIN');
        let rechazado = false;

        try {
            await cliente.query(
                `
                UPDATE usuarios
                SET codigo_operario = '9999'
                WHERE LOWER(correo) = $1
                `,
                [OPERARIO]
            );
        } catch (error) {
            rechazado = error.code === '23514';
        }

        await cliente.query('ROLLBACK');
        registrar(
            'la base rechaza un código distinto al del NIT',
            rechazado
        );
    } finally {
        cliente.release();
    }

    const clienteSinEmpresa = await pool.connect();

    try {
        await clienteSinEmpresa.query('BEGIN');
        let rechazado = false;

        try {
            await clienteSinEmpresa.query(
                `
                INSERT INTO usuarios
                    (nombre, correo, password, tipo_usuario, codigo_operario)
                VALUES ($1, $2, $3, 'operario', '1234')
                `,
                [
                    'Operario sin empresa',
                    `sin.empresa.${Date.now()}@runtrash.test`,
                    'scrypt$prueba'
                ]
            );
        } catch (error) {
            rechazado = error.code === '23514';
        }

        await clienteSinEmpresa.query('ROLLBACK');
        registrar(
            'la base exige empresa para un operario',
            rechazado
        );
    } finally {
        clienteSinEmpresa.release();
    }
} finally {
    await pool.end();
}

console.table(resultados);

if (resultados.some((item) => !item.ok)) {
    process.exitCode = 1;
}
