/**
 * @file Pruebas del canal de eventos SSE.
 *
 * Verifica el formato de los eventos y que el filtrado por usuario,
 * rol y empresa impida fugas entre cuentas.
 *
 * @module test/eventos
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    agregarCliente,
    quitarCliente,
    emitirEvento,
    totalClientes
} = require('../lib/eventos');

/**
 * Crea un cliente SSE falso que acumula los mensajes recibidos.
 *
 * @returns {{cliente: object, recibidos: string[]}} Cliente y su bandeja.
 */
function clienteFalso() {
    const recibidos = [];
    const cliente = {
        /**
         * Simula el `write` de una respuesta SSE.
         *
         * @param {string} mensaje - Evento serializado.
         * @returns {void}
         */
        write(mensaje) {
            recibidos.push(mensaje);
        }
    };

    return { cliente, recibidos };
}

test('emitirEvento escribe un evento SSE al cliente destinatario', () => {
    const { cliente, recibidos } = clienteFalso();
    const usuario = { id: 7, tipo_usuario: 'admin', empresa_id: null };

    agregarCliente(cliente, usuario);
    assert.equal(totalClientes(), 1);

    emitirEvento('reporte_creado', { id: 42 }, { roles: ['admin'] });

    assert.equal(recibidos.length, 1);
    assert.match(recibidos[0], /^data: /);
    assert.match(recibidos[0], /"tipo":"reporte_creado"/);
    assert.match(recibidos[0], /"id":42/);

    quitarCliente(cliente);
    assert.equal(totalClientes(), 0);
});

test('emitirEvento no entrega eventos de un usuario a otro', () => {
    const ciudadano = clienteFalso();
    const otro = clienteFalso();

    agregarCliente(ciudadano.cliente, {
        id: 10,
        tipo_usuario: 'ciudadano',
        empresa_id: null
    });
    agregarCliente(otro.cliente, {
        id: 11,
        tipo_usuario: 'ciudadano',
        empresa_id: null
    });

    emitirEvento('notificaciones_leidas', { usuario_id: 10 }, {
        usuarios: [10]
    });

    assert.equal(ciudadano.recibidos.length, 1);
    assert.equal(otro.recibidos.length, 0);

    quitarCliente(ciudadano.cliente);
    quitarCliente(otro.cliente);
});

test('emitirEvento aísla eventos de empresa por empresa_id', () => {
    const empresaA = clienteFalso();
    const empresaB = clienteFalso();

    agregarCliente(empresaA.cliente, {
        id: 20,
        tipo_usuario: 'empresa',
        empresa_id: 1
    });
    agregarCliente(empresaB.cliente, {
        id: 21,
        tipo_usuario: 'empresa',
        empresa_id: 2
    });

    emitirEvento('reporte_asignado', { reporte_id: 5 }, {
        roles: ['empresa'],
        empresaId: 1
    });

    assert.equal(empresaA.recibidos.length, 1);
    assert.equal(empresaB.recibidos.length, 0);

    quitarCliente(empresaA.cliente);
    quitarCliente(empresaB.cliente);
});

test('emitirEvento no falla si no hay clientes', () => {
    assert.doesNotThrow(() => emitirEvento('sin_clientes'));
});
