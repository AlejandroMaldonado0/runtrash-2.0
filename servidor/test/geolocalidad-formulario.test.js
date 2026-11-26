/**
 * @file Pruebas de la integración del GPS con el selector de localidad.
 *
 * Carga `formulario.js` en un contexto aislado con un DOM mínimo para
 * comprobar que, al obtener la ubicación, la localidad se selecciona
 * sola y que una elección manual del ciudadano se respeta.
 *
 * @module test/geolocalidad-formulario
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RUTA_FORMULARIO = path.resolve(__dirname, '..', '..', 'frontend', 'pages', 'ciudadano', 'formulario.js');
const CODIGO = fs.readFileSync(RUTA_FORMULARIO, 'utf8');

/**
 * Crea un elemento falso con lo mínimo que usa el formulario.
 *
 * @param {string} [valor=""] - Valor inicial.
 * @returns {object} Elemento simulado.
 */
function crearElemento(valor = "") {
    const clases = new Set();

    return {
        value: valor,
        textContent: "",
        className: "",
        dataset: {},
        disabled: false,
        isConnected: true,
        classList: {
            add: (clase) => clases.add(clase),
            remove: (clase) => clases.delete(clase),
            contains: (clase) => clases.has(clase)
        }
    };
}

/**
 * Carga el formulario con un DOM y un GPS simulados.
 *
 * @param {object} opciones
 * @param {(lat: number, lon: number) => Promise<string|null>} opciones.detectar - Detección falsa.
 * @returns {{contexto: object, elementos: Record<string, object>}}
 */
function cargarFormulario({ detectar }) {
    const elementos = {
        gpsButton: crearElemento(),
        gpsStatus: crearElemento(),
        nuevaLatitud: crearElemento(),
        nuevaLongitud: crearElemento(),
        nuevaUbicacion: crearElemento(),
        nuevaLocalidad: crearElemento()
    };

    const contexto = {
        console,
        document: {
            getElementById: (id) => elementos[id] || null
        },
        navigator: {
            geolocation: {
                getCurrentPosition(exito) {
                    exito({ coords: { latitude: 4.6486, longitude: -74.0628, accuracy: 12 } });
                }
            }
        },
        LocalidadesBogota: {
            cargar: async () => [],
            detectar
        }
    };

    vm.createContext(contexto);
    vm.runInContext(CODIGO, contexto, { filename: RUTA_FORMULARIO });

    return { contexto, elementos };
}

/**
 * Deja correr las promesas pendientes del flujo asíncrono.
 *
 * @returns {Promise<void>}
 */
function esperarMicrotareas() {
    return new Promise((resolver) => setImmediate(resolver));
}

test('el GPS selecciona la localidad detectada y lo informa', async () => {
    const { contexto, elementos } = cargarFormulario({
        detectar: async () => "Chapinero"
    });

    contexto.usarUbicacion();
    await esperarMicrotareas();

    assert.equal(elementos.nuevaLatitud.value, 4.6486);
    assert.equal(elementos.nuevaLongitud.value, -74.0628);
    assert.equal(elementos.nuevaLocalidad.value, "Chapinero");
    assert.equal(elementos.nuevaLocalidad.dataset.detectado, "1");
    assert.equal(elementos.nuevaLocalidad.classList.contains("campo-detectado"), true);
    assert.match(elementos.gpsStatus.textContent, /Chapinero/);
    assert.match(elementos.gpsStatus.textContent, /12 m/);
    assert.equal(elementos.gpsStatus.className, "field-status is-success");
});

test('una localidad elegida a mano no se sobrescribe', async () => {
    const { contexto, elementos } = cargarFormulario({
        detectar: async () => "Chapinero"
    });

    elementos.nuevaLocalidad.value = "Suba";

    contexto.usarUbicacion();
    await esperarMicrotareas();

    assert.equal(elementos.nuevaLocalidad.value, "Suba");
    assert.match(elementos.gpsStatus.textContent, /localidad detectada: Chapinero/);
});

test('si el punto no cae en Bogotá pide elegir la localidad', async () => {
    const { contexto, elementos } = cargarFormulario({
        detectar: async () => null
    });

    contexto.usarUbicacion();
    await esperarMicrotareas();

    assert.equal(elementos.nuevaLocalidad.value, "");
    assert.match(elementos.gpsStatus.textContent, /selecciónala manualmente/);
    assert.equal(elementos.gpsStatus.className, "field-status is-warning");
});

test('un fallo al cargar los polígonos no rompe el formulario', async () => {
    const { contexto, elementos } = cargarFormulario({
        detectar: async () => {
            throw new Error("sin conexión");
        }
    });

    contexto.usarUbicacion();
    await esperarMicrotareas();

    assert.equal(elementos.nuevaLocalidad.value, "");
    assert.match(elementos.gpsStatus.textContent, /selecciona la localidad manualmente/);
    assert.equal(elementos.nuevaLatitud.value, 4.6486);
});

test('si el modal se cierra antes de detectar, no se toca nada', async () => {
    const { contexto, elementos } = cargarFormulario({
        detectar: async () => "Chapinero"
    });

    elementos.gpsStatus.isConnected = false;

    contexto.usarUbicacion();
    await esperarMicrotareas();

    assert.equal(elementos.nuevaLocalidad.value, "");
});
