/**
 * @file Pruebas de autorización de las fotos de reportes.
 *
 * La foto del operario se sirve por el mismo endpoint que la del
 * ciudadano, así que la consulta de permisos debe reconocer ambas
 * columnas (`imagen_url` e `imagen_operario_url`).
 *
 * @module test/imagenes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../lib/db');
const { autorizarImagen } = require('../lib/imagenes');

/**
 * Sustituye temporalmente la consulta del pool para no depender de
 * una base de datos real.
 *
 * @param {object|null} reporte - Fila que devolvería PostgreSQL.
 * @returns {{sql: () => string, restaurar: () => void}}
 */
function simularConsulta(reporte) {
    const original = pool.query;
    let sql = '';

    pool.query = async (texto) => {
        sql = String(texto);
        return {
            rowCount: reporte ? 1 : 0,
            rows: reporte ? [reporte] : []
        };
    };

    return {
        sql: () => sql,
        restaurar: () => {
            pool.query = original;
        }
    };
}

/**
 * Respuesta mínima de Express para comprobar el estado HTTP.
 *
 * @returns {object}
 */
function respuestaFalsa() {
    return {
        codigo: null,
        status(codigo) {
            this.codigo = codigo;
            return this;
        },
        json() {
            return this;
        }
    };
}

const REPORTE = {
    usuario_id: 11,
    operario_id: 22,
    localidad: 'Usaquén',
    empresa_operario_id: 3,
    localidad_atendida: false
};

test('la autorización reconoce la foto del operario', async (t) => {
    const consulta = simularConsulta(REPORTE);
    t.after(consulta.restaurar);

    const req = {
        params: { segmentos: ['2026', '11', 'evidencia.jpg'] },
        usuarioAutenticado: {
            id: 22,
            tipo_usuario: 'operario',
            empresa_id: 3
        }
    };
    const res = respuestaFalsa();
    let siguiente = false;

    await autorizarImagen(req, res, () => {
        siguiente = true;
    });

    assert.match(consulta.sql(), /imagen_operario_url/);
    assert.equal(siguiente, true);
    assert.equal(res.codigo, null);
});

test('un usuario ajeno no puede ver la foto del operario', async (t) => {
    const consulta = simularConsulta(REPORTE);
    t.after(consulta.restaurar);

    const req = {
        params: { segmentos: ['2026', '11', 'evidencia.jpg'] },
        usuarioAutenticado: {
            id: 99,
            tipo_usuario: 'ciudadano',
            empresa_id: null
        }
    };
    const res = respuestaFalsa();
    let siguiente = false;

    await autorizarImagen(req, res, () => {
        siguiente = true;
    });

    assert.equal(siguiente, false);
    assert.equal(res.codigo, 403);
});

test('la empresa dueña del reporte puede ver la foto del operario', async (t) => {
    const consulta = simularConsulta(REPORTE);
    t.after(consulta.restaurar);

    const req = {
        params: { segmentos: ['2026', '11', 'evidencia.jpg'] },
        usuarioAutenticado: {
            id: 44,
            tipo_usuario: 'empresa',
            empresa_id: 3
        }
    };
    const res = respuestaFalsa();
    let siguiente = false;

    await autorizarImagen(req, res, () => {
        siguiente = true;
    });

    assert.equal(siguiente, true);
    assert.equal(res.codigo, null);
});
