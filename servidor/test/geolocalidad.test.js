/**
 * @file Pruebas de la detección de localidad por coordenadas.
 *
 * El formulario del ciudadano elige automáticamente la localidad con
 * el GPS. Estas pruebas validan el dataset de polígonos y el algoritmo
 * de punto-en-polígono que usa el navegador.
 *
 * @module test/geolocalidad
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const app = require('../server');

const { preparar, detectarEn, detectar } = require('../../frontend/pages/ciudadano/localidades.js');

const RUTA_DATOS = path.resolve(__dirname, '..', '..', 'frontend', 'data', 'localidades-bogota.json');

const DATOS = JSON.parse(fs.readFileSync(RUTA_DATOS, 'utf8'));
const LOCALIDADES = preparar(DATOS);

const OFICIALES = [
    'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme',
    'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
    'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires',
    'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
    'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz'
];

/**
 * Busca un punto interior de una localidad recorriendo su caja
 * envolvente. Sirve para probar los 20 polígonos sin depender de
 * coordenadas escritas a mano.
 *
 * @param {string} nombre - Localidad buscada.
 * @returns {[number, number]|null} `[lat, lon]` interior o `null`.
 */
function puntoInterior(nombre) {
    const localidad = LOCALIDADES.find((item) => item.nombre === nombre);
    if (!localidad) return null;

    const [minLon, minLat, maxLon, maxLat] = localidad.bbox;
    const pasos = 48;

    for (let fila = 1; fila < pasos; fila++) {
        for (let columna = 1; columna < pasos; columna++) {
            const lon = minLon + ((maxLon - minLon) * columna) / pasos;
            const lat = minLat + ((maxLat - minLat) * fila) / pasos;
            if (detectarEn(lat, lon, LOCALIDADES) === nombre) {
                return [lat, lon];
            }
        }
    }

    return null;
}

test('el dataset trae las 20 localidades oficiales en orden', () => {
    assert.equal(DATOS.version, 1);
    assert.match(DATOS.fuente, /Bogotá/);
    assert.deepEqual(Object.keys(DATOS.localidades), OFICIALES);
});

test('cada localidad tiene anillos cerrados y coordenadas válidas', () => {
    for (const [nombre, anillos] of Object.entries(DATOS.localidades)) {
        assert.ok(anillos.length >= 1, `${nombre} no tiene anillos`);

        for (const anillo of anillos) {
            assert.ok(anillo.length >= 4, `${nombre} tiene un anillo demasiado corto`);

            const primero = anillo[0];
            const ultimo = anillo[anillo.length - 1];
            assert.deepEqual(primero, ultimo, `${nombre} tiene un anillo sin cerrar`);

            for (const [lon, lat] of anillo) {
                assert.ok(Number.isFinite(lon) && Number.isFinite(lat), `${nombre} tiene coordenadas inválidas`);
                assert.ok(lon > -75 && lon < -73, `${nombre} tiene una longitud fuera de Bogotá`);
                assert.ok(lat > 3 && lat < 5, `${nombre} tiene una latitud fuera de Bogotá`);
            }
        }
    }
});

test('un punto interior de cada localidad se detecta con su nombre', () => {
    for (const nombre of OFICIALES) {
        const punto = puntoInterior(nombre);
        assert.ok(punto, `No se encontró un punto interior para ${nombre}`);

        const [lat, lon] = punto;
        assert.equal(detectarEn(lat, lon, LOCALIDADES), nombre);
    }
});

test('las coordenadas conocidas caen en la localidad correcta', () => {
    const casos = [
        ['Chapinero', 4.6486, -74.0628],
        ['Suba', 4.7410, -74.0930],
        ['Kennedy', 4.6280, -74.1550],
        ['Usme', 4.4700, -74.1200],
        ['Bosa', 4.6170, -74.1900],
        ['Teusaquillo', 4.6370, -74.0900],
        ['Usaquén', 4.7200, -74.0350],
        ['Fontibón', 4.6700, -74.1450]
    ];

    for (const [esperada, lat, lon] of casos) {
        assert.equal(detectarEn(lat, lon, LOCALIDADES), esperada, `Falla en ${esperada}`);
    }
});

test('un punto fuera de Bogotá no devuelve localidad', () => {
    /* Medellín y Soacha quedan fuera del perímetro distrital. */
    assert.equal(detectarEn(6.2442, -75.5812, LOCALIDADES), null);
    assert.equal(detectarEn(4.5794, -74.2168, LOCALIDADES), null);
});

test('detectar descarta coordenadas inválidas sin descargar el dataset', async () => {
    assert.equal(await detectar(6.2442, -75.5812), null);
    assert.equal(await detectar(Number.NaN, -74.0721), null);
    assert.equal(await detectar(4.7110, undefined), null);
});

test('la aplicación sirve el dataset y el módulo de detección', async () => {
    const datos = await request(app).get('/frontend/data/localidades-bogota.json');

    assert.equal(datos.status, 200);
    assert.match(String(datos.headers['content-type']), /json/);
    assert.equal(Object.keys(datos.body.localidades).length, 20);
    assert.equal(datos.body.localidades.Chapinero.length, 1);

    const modulo = await request(app).get('/frontend/pages/ciudadano/localidades.js');

    assert.equal(modulo.status, 200);
    assert.match(String(modulo.headers['content-type']), /javascript/);
    assert.match(modulo.text, /LocalidadesBogota/);
});
