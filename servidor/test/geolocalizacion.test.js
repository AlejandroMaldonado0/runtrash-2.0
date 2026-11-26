/**
 * @file Pruebas de la localidad calculada en el servidor.
 *
 * La localidad del reporte ya no se acepta desde el cliente: se
 * resuelve con las coordenadas GPS. Estas pruebas cubren las reglas
 * que aplica la ruta antes de guardar un reporte.
 *
 * @module test/geolocalizacion
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    detectarLocalidad,
    leerCoordenada,
    resolverLocalidad
} = require('../lib/geolocalizacion');

test('resolverLocalidad calcula la localidad con las coordenadas', () => {
    const resultado = resolverLocalidad({
        latitud: '4.6486',
        longitud: '-74.0628'
    });

    assert.equal(resultado.ok, true);
    assert.equal(resultado.localidad, 'Chapinero');
    assert.equal(resultado.latitud, 4.6486);
    assert.equal(resultado.longitud, -74.0628);
});

test('sin GPS el reporte no se puede registrar', () => {
    for (const coordenadas of [{}, { latitud: '4.6486' }, { longitud: '-74.0628' }, { latitud: '', longitud: '' }]) {
        const resultado = resolverLocalidad(coordenadas);

        assert.equal(resultado.ok, false);
        assert.match(resultado.mensaje, /Activa la ubicación GPS/);
    }
});

test('unas coordenadas inválidas se rechazan', () => {
    for (const coordenadas of [
        { latitud: 'norte', longitud: '-74.0628' },
        { latitud: 120, longitud: -74.0628 },
        { latitud: 4.6486, longitud: 200 }
    ]) {
        const resultado = resolverLocalidad(coordenadas);

        assert.equal(resultado.ok, false);
        assert.match(resultado.mensaje, /coordenadas GPS no son válidas/);
    }
});

test('una ubicación fuera de Bogotá se rechaza', () => {
    /* Medellín y Soacha quedan fuera del perímetro distrital. */
    for (const coordenadas of [
        { latitud: 6.2442, longitud: -75.5812 },
        { latitud: 4.5794, longitud: -74.2168 }
    ]) {
        const resultado = resolverLocalidad(coordenadas);

        assert.equal(resultado.ok, false);
        assert.match(resultado.mensaje, /no está dentro de Bogotá/);
    }
});

test('detectarLocalidad coincide con los polígonos del navegador', () => {
    assert.equal(detectarLocalidad(4.6486, -74.0628), 'Chapinero');
    assert.equal(detectarLocalidad(4.7410, -74.0930), 'Suba');
    assert.equal(detectarLocalidad(4.6280, -74.1550), 'Kennedy');
    assert.equal(detectarLocalidad(4.4700, -74.1200), 'Usme');
    assert.equal(detectarLocalidad(Number.NaN, -74.0628), null);
    assert.equal(detectarLocalidad(6.2442, -75.5812), null);
});

test('leerCoordenada distingue vacío de cero', () => {
    assert.equal(leerCoordenada(undefined), null);
    assert.equal(leerCoordenada(null), null);
    assert.equal(leerCoordenada('   '), null);
    assert.equal(leerCoordenada('0'), 0);
    assert.equal(leerCoordenada(4.6486), 4.6486);
});
