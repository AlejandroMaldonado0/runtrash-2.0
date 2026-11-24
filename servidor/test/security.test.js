/**
 * @file Pruebas de las utilidades criptográficas.
 *
 * Verifica el hash de contraseñas, el rechazo de valores en texto plano,
 * la política de contraseñas y la determinación del hash de sesión.
 *
 * @module test/security
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    hashPassword,
    verifyPassword,
    esHashPassword,
    validarPassword,
    hashSessionToken
} = require('../lib/security');

test('hashPassword genera hashes verificables y únicos', () => {
    const first = hashPassword('una-clave-segura-1');
    const second = hashPassword('una-clave-segura-1');

    assert.notEqual(first, second);
    assert.equal(esHashPassword(first), true);
    assert.equal(verifyPassword('una-clave-segura-1', first), true);
    assert.equal(verifyPassword('otra-clave', first), false);
});

test('verifyPassword rechaza contraseñas guardadas en texto plano', () => {
    assert.equal(esHashPassword('antigua'), false);
    assert.equal(verifyPassword('antigua', 'antigua'), false);
});

test('validarPassword exige longitud y mezcla de letras y números', () => {
    assert.equal(validarPassword('corta1').ok, false);
    assert.equal(validarPassword('sololetras').ok, false);
    assert.equal(validarPassword('12345678').ok, false);
    assert.equal(validarPassword('Clave123').ok, true);
});

test('hashSessionToken produce SHA-256 determinista', () => {
    const token = 'token-de-prueba';
    const hash = hashSessionToken(token);

    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash, hashSessionToken(token));
    assert.notEqual(hash, token);
});
