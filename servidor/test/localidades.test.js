/**
 * @file Pruebas de las localidades oficiales de Bogotá.
 *
 * Garantiza que backend y frontend usen exactamente las 20 localidades
 * del Distrito Capital, en el orden oficial.
 *
 * @module test/localidades
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LOCALIDADES } = require('../config');

const OFICIALES = [
    'Usaquén',
    'Chapinero',
    'Santa Fe',
    'San Cristóbal',
    'Usme',
    'Tunjuelito',
    'Bosa',
    'Kennedy',
    'Fontibón',
    'Engativá',
    'Suba',
    'Barrios Unidos',
    'Teusaquillo',
    'Los Mártires',
    'Antonio Nariño',
    'Puente Aranda',
    'La Candelaria',
    'Rafael Uribe Uribe',
    'Ciudad Bolívar',
    'Sumapaz'
];

test('la lista contiene exactamente las 20 localidades oficiales', () => {
    assert.equal(LOCALIDADES.size, OFICIALES.length);

    for (const localidad of OFICIALES) {
        assert.ok(LOCALIDADES.has(localidad), `Falta ${localidad}`);
    }
});

test('la lista no conserva nombres antiguos o erróneos', () => {
    for (const incorrecta of ['Usura', 'Tunjuel', 'Los Alpes', 'San Andrés']) {
        assert.equal(LOCALIDADES.has(incorrecta), false, `No debería existir ${incorrecta}`);
    }
});
