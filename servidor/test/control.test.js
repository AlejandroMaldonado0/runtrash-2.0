/**
 * @file Pruebas del aislamiento entre entes de control.
 *
 * Verifica que el administrador conserve la vista global y que cada
 * ente de control (Distrito, Policía y SSPD) quede limitado a su propio
 * rol. La consulta SQL real se comprueba en
 * `scripts/verificar-seguridad.mjs` contra el servidor local.
 *
 * @module test/control
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { enteAislado } = require('../repositories/control');

test('el administrador conserva la vista global de seguimientos', () => {
  assert.equal(enteAislado('admin'), null);
});

test('cada ente de control filtra por su propio rol', () => {
  assert.equal(enteAislado('distrito'), 'distrito');
  assert.equal(enteAislado('policia'), 'policia');
  assert.equal(enteAislado('sspd'), 'sspd');
});

test('un rol ausente o vacío no abre la vista global', () => {
  assert.equal(enteAislado(), 'ente-desconocido');
  assert.equal(enteAislado(''), 'ente-desconocido');
  assert.equal(enteAislado('   '), 'ente-desconocido');
});
