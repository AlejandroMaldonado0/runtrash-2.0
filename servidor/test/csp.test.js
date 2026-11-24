/**
 * @file Pruebas de la política de seguridad de contenido y del alcance
 * del registro público.
 *
 * @module test/csp
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

/**
 * Convierte la cabecera CSP en un mapa directiva → valores.
 *
 * @param {string} cabecera - Valor de `Content-Security-Policy`.
 * @returns {Map<string, string[]>} Directivas separadas por `;`.
 */
function parsearCsp(cabecera) {
    const directivas = new Map();

    for (const parte of String(cabecera).split(';')) {
        const [nombre, ...valores] = parte.trim().split(/\s+/).filter(Boolean);
        if (nombre) directivas.set(nombre, valores);
    }

    return directivas;
}

test('la CSP no permite scripts inline ni eval', async () => {
    const respuesta = await request(app).get('/api/notificaciones');
    const cabecera = respuesta.headers['content-security-policy'];

    assert.ok(cabecera, 'la respuesta debe incluir Content-Security-Policy');

    const directivas = parsearCsp(cabecera);
    const scriptSrc = directivas.get('script-src') || [];

    assert.ok(scriptSrc.includes("'self'"));
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'script-src no debe permitir inline');
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), 'script-src no debe permitir eval');
});

test('la CSP no necesita relajar los atributos inline', async () => {
    const respuesta = await request(app).get('/api/notificaciones');
    const directivas = parsearCsp(respuesta.headers['content-security-policy']);
    const attr = directivas.get('script-src-attr') || [];

    assert.ok(!attr.includes("'unsafe-inline'"), 'script-src-attr no debe permitir inline');
});

test('el registro público solo permite crear ciudadanos', async () => {
    for (const tipo of ['operario', 'empresa', 'admin', 'distrito', 'policia', 'sspd']) {
        const respuesta = await request(app)
            .post('/api/registro')
            .send({
                nombre: 'Prueba',
                correo: `${tipo}@ejemplo.test`,
                password: 'Clave123',
                tipo_usuario: tipo
            });

        assert.equal(respuesta.status, 403, `debe rechazar el rol ${tipo}`);
        assert.equal(respuesta.body.ok, false);
        assert.match(respuesta.body.mensaje, /administrador/i);
    }
});
