/**
 * @file Pruebas de las utilidades de concurrencia del backend.
 *
 * No tocan la base de datos: comprueban el comportamiento de los
 * helpers que reparten tareas asíncronas.
 *
 * @module test/concurrencia
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    enParalelo,
    enParaleloSeguro,
    mapaConcurrente
} = require('../lib/concurrencia');

/**
 * Espera un número de milisegundos.
 *
 * @param {number} ms - Tiempo de espera.
 * @returns {Promise<void>}
 */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('enParalelo devuelve los resultados en el orden de entrada', async () => {
    const resultados = await enParalelo([
        async () => {
            await esperar(20);
            return 'primero';
        },
        async () => 'segundo',
        async () => {
            await esperar(10);
            return 'tercero';
        }
    ]);

    assert.deepEqual(resultados, ['primero', 'segundo', 'tercero']);
});

test('enParaleloSeguro no aborta cuando una tarea falla', async () => {
    const resultados = await enParaleloSeguro([
        async () => 1,
        async () => {
            throw new Error('fallo esperado');
        },
        async () => 3
    ]);

    assert.equal(resultados[0].ok, true);
    assert.equal(resultados[0].valor, 1);
    assert.equal(resultados[1].ok, false);
    assert.match(resultados[1].error.message, /fallo esperado/);
    assert.equal(resultados[2].ok, true);
    assert.equal(resultados[2].valor, 3);
});

test('mapaConcurrente respeta el límite de tareas simultáneas', async () => {
    let activas = 0;
    let maximo = 0;

    const resultados = await mapaConcurrente(
        [1, 2, 3, 4, 5, 6],
        2,
        async (elemento) => {
            activas += 1;
            maximo = Math.max(maximo, activas);
            await esperar(5);
            activas -= 1;
            return elemento * 2;
        }
    );

    assert.deepEqual(resultados, [2, 4, 6, 8, 10, 12]);
    assert.ok(maximo <= 2, `Se ejecutaron ${maximo} tareas a la vez`);
    assert.equal(maximo, 2);
});

test('mapaConcurrente con lista vacía no ejecuta la tarea', async () => {
    let llamadas = 0;

    const resultados = await mapaConcurrente([], 3, async () => {
        llamadas += 1;
        return null;
    });

    assert.deepEqual(resultados, []);
    assert.equal(llamadas, 0);
});
