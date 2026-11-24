/**
 * @file Pruebas del cálculo de XP del perfil ciudadano.
 *
 * El servidor convierte la actividad real en puntos; el cliente usa el
 * mismo desglose para pintar la barra de nivel. Estas pruebas fijan las
 * reglas para que ambos lados no se separen.
 *
 * @module test/perfil
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularXP } = require('../repositories/perfil');

test('calcularXP devuelve cero cuando no hay actividad', () => {
  const xp = calcularXP();

  assert.deepEqual(xp, {
    total: 0,
    enviados: 0,
    fotoGeo: 0,
    enProceso: 0,
    completados: 0,
    racha: 0
  });
});

test('calcularXP suma cada regla sobre la actividad real', () => {
  const xp = calcularXP({
    enviados: 1,
    foto_geo: 1,
    en_proceso: 1,
    completados: 1,
    semana: 0
  });

  assert.equal(xp.enviados, 50);
  assert.equal(xp.fotoGeo, 20);
  assert.equal(xp.enProceso, 30);
  assert.equal(xp.completados, 100);
  assert.equal(xp.racha, 0);
  assert.equal(xp.total, 200);
});

test('calcularXP añade la racha semanal cuando hubo reportes esta semana', () => {
  const xp = calcularXP({ semana: 1 });

  assert.equal(xp.racha, 50);
  assert.equal(xp.total, 50);
});

test('calcularXP reparte 2.450 XP en el caso de nivel 10', () => {
  const xp = calcularXP({
    enviados: 13,
    foto_geo: 13,
    en_proceso: 13,
    completados: 11,
    semana: 1
  });

  assert.equal(xp.total, 2450);
});
