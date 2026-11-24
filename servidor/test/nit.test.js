/**
 * @file Pruebas de la derivación del código de operario desde el NIT.
 *
 * @module test/nit
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    soloDigitos,
    normalizarNit,
    codigoOperarioDesdeNit,
    codigoOperarioValido
} = require('../lib/nit');

test('el código de operario son los últimos cuatro dígitos del NIT', () => {
    assert.equal(codigoOperarioDesdeNit('900123456-7'), '4567');
    assert.equal(codigoOperarioDesdeNit('123456789'), '6789');
    assert.equal(codigoOperarioDesdeNit('900.123.456-7'), '4567');
});

test('un NIT sin cuatro dígitos no produce código', () => {
    assert.equal(codigoOperarioDesdeNit('12'), null);
    assert.equal(codigoOperarioDesdeNit(''), null);
    assert.equal(codigoOperarioDesdeNit(null), null);
});

test('codigoOperarioValido compara contra el NIT de la empresa', () => {
    assert.equal(codigoOperarioValido('4567', '900123456-7'), true);
    assert.equal(codigoOperarioValido('4568', '900123456-7'), false);
    assert.equal(codigoOperarioValido('UI-000001', '900123456-7'), false);
});

test('soloDigitos y normalizarNit preparan los valores de entrada', () => {
    assert.equal(soloDigitos('900.123.456-7'), '9001234567');
    assert.equal(normalizarNit('  900123456-7  '), '900123456-7');
});
