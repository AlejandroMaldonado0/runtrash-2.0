/**
 * Genera `frontend/data/localidades-bogota.json`.
 *
 * Toma el TopoJSON de las 20 localidades (Acuerdo 117 de 2003),
 * decodifica sus arcos y simplifica cada anillo con Douglas-Peucker
 * para que el navegador pueda resolver un punto con poco peso.
 *
 * Uso: node servidor/scripts/generar-localidades.js
 *
 * El TopoJSON se descarga del gist publicado o se lee de la ruta
 * indicada en `LOCALIDADES_TOPOJSON`.
 */

const fs = require('node:fs');
const path = require('node:path');

const ORIGEN_URL = 'https://gist.githubusercontent.com/jupaneira/a02af9ac03957aed15939ef72bfecfd2/raw/a75ede89adabff65c739268fb8d61137169b5691/bta_localidades.json';

const DESTINO = path.resolve(__dirname, '..', '..', 'frontend', 'data', 'localidades-bogota.json');

/** Nombre oficial tal como aparece en la app. */
const NOMBRES = {
    USAQUEN: 'Usaquén',
    CHAPINERO: 'Chapinero',
    'SANTA FE': 'Santa Fe',
    'SAN CRISTOBAL': 'San Cristóbal',
    USME: 'Usme',
    TUNJUELITO: 'Tunjuelito',
    BOSA: 'Bosa',
    KENNEDY: 'Kennedy',
    FONTIBON: 'Fontibón',
    ENGATIVA: 'Engativá',
    SUBA: 'Suba',
    'BARRIOS UNIDOS': 'Barrios Unidos',
    TEUSAQUILLO: 'Teusaquillo',
    'LOS MARTIRES': 'Los Mártires',
    'ANTONIO NARIÑO': 'Antonio Nariño',
    'PUENTE ARANDA': 'Puente Aranda',
    CANDELARIA: 'La Candelaria',
    'RAFAEL URIBE URIBE': 'Rafael Uribe Uribe',
    'CIUDAD BOLIVAR': 'Ciudad Bolívar',
    SUMAPAZ: 'Sumapaz'
};

const ORDEN = [
    'Usaquén', 'Chapinero', 'Santa Fe', 'San Cristóbal', 'Usme',
    'Tunjuelito', 'Bosa', 'Kennedy', 'Fontibón', 'Engativá',
    'Suba', 'Barrios Unidos', 'Teusaquillo', 'Los Mártires',
    'Antonio Nariño', 'Puente Aranda', 'La Candelaria',
    'Rafael Uribe Uribe', 'Ciudad Bolívar', 'Sumapaz'
];

/* Tolerancia en grados (~55 m). Conserva las fronteras urbanas
   reconocibles sin cargar los 57 000 vértices originales. */
const TOLERANCIA = 0.0005;

/**
 * Lee el TopoJSON de disco o lo descarga del gist.
 *
 * @returns {Promise<object>} Topología de las localidades.
 */
async function leerTopojson() {
    const ruta = String(process.env.LOCALIDADES_TOPOJSON || '').trim();

    if (ruta) {
        return JSON.parse(fs.readFileSync(ruta, 'utf8'));
    }

    const respuesta = await fetch(ORIGEN_URL);
    if (!respuesta.ok) {
        throw new Error(`No se pudo descargar el TopoJSON (${respuesta.status}).`);
    }

    return respuesta.json();
}

/**
 * Decodifica un arco del TopoJSON a coordenadas [lon, lat].
 *
 * @param {number[][]} arco - Pares de deltas.
 * @param {number[]} scale - Escala de la topología.
 * @param {number[]} translate - Traslación de la topología.
 * @returns {Array<[number, number]>} Vértices absolutos.
 */
function decodificarArco(arco, scale, translate) {
    let x = 0;
    let y = 0;

    return arco.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
}

/**
 * Une los arcos de un anillo en una lista de vértices.
 *
 * @param {number[]} indices - Índices de arcos (`~i` indica inverso).
 * @param {Array<Array<[number, number]>>} arcos - Arcos ya decodificados.
 * @returns {Array<[number, number]>} Anillo completo.
 */
function construirAnillo(indices, arcos) {
    const puntos = [];

    for (const indice of indices) {
        const invertido = indice < 0;
        const arco = arcos[invertido ? ~indice : indice];
        const segmento = invertido ? arco.slice().reverse() : arco;

        for (const punto of segmento) {
            const ultimo = puntos[puntos.length - 1];
            if (ultimo && ultimo[0] === punto[0] && ultimo[1] === punto[1]) continue;
            puntos.push(punto);
        }
    }

    return puntos;
}

/**
 * Distancia de un punto al segmento entre otros dos.
 *
 * @param {[number, number]} punto
 * @param {[number, number]} inicio
 * @param {[number, number]} fin
 * @returns {number} Distancia en grados.
 */
function distanciaASegmento(punto, inicio, fin) {
    const [x, y] = punto;
    const [x1, y1] = inicio;
    const [x2, y2] = fin;
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);

    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/**
 * Simplifica un anillo cerrado con Douglas-Peucker.
 *
 * @param {Array<[number, number]>} puntos - Anillo original.
 * @param {number} tolerancia - Distancia máxima en grados.
 * @returns {Array<[number, number]>} Anillo simplificado y cerrado.
 */
function simplificarAnillo(puntos, tolerancia) {
    if (puntos.length <= 4) return puntos;

    const cerrado = puntos[0][0] === puntos[puntos.length - 1][0]
        && puntos[0][1] === puntos[puntos.length - 1][1];
    const cuerpo = cerrado ? puntos.slice(0, -1) : puntos.slice();

    if (cuerpo.length <= 3) return puntos;

    const conservar = new Array(cuerpo.length).fill(false);
    conservar[0] = true;
    conservar[cuerpo.length - 1] = true;

    const pila = [[0, cuerpo.length - 1]];

    while (pila.length) {
        const [primero, ultimo] = pila.pop();
        let maxima = 0;
        let indice = -1;

        for (let i = primero + 1; i < ultimo; i++) {
            const distancia = distanciaASegmento(cuerpo[i], cuerpo[primero], cuerpo[ultimo]);
            if (distancia > maxima) {
                maxima = distancia;
                indice = i;
            }
        }

        if (indice !== -1 && maxima > tolerancia) {
            conservar[indice] = true;
            pila.push([primero, indice], [indice, ultimo]);
        }
    }

    const simplificado = cuerpo.filter((_, i) => conservar[i]);
    if (simplificado.length < 4) return cuerpo.slice(0, 4).concat([cuerpo[0]]);
    simplificado.push(simplificado[0]);
    return simplificado;
}

/**
 * Redondea a 5 decimales (~1 m) para recortar el JSON.
 *
 * @param {Array<[number, number]>} puntos
 * @returns {Array<[number, number]>}
 */
function redondear(puntos) {
    return puntos.map(([lon, lat]) => [
        Number(lon.toFixed(5)),
        Number(lat.toFixed(5))
    ]);
}

async function main() {
    const topo = await leerTopojson();
    const { scale, translate } = topo.transform;
    const arcos = topo.arcs.map((arco) => decodificarArco(arco, scale, translate));

    const localidades = {};

    for (const geometria of topo.objects.bta_localidades.geometries) {
        const nombre = NOMBRES[geometria.properties.NOMBRE];
        if (!nombre) throw new Error(`Localidad sin nombre conocido: ${geometria.properties.NOMBRE}`);

        localidades[nombre] = geometria.arcs
            .map((indices) => construirAnillo(indices, arcos))
            .map((anillo) => redondear(simplificarAnillo(anillo, TOLERANCIA)));
    }

    const salida = {
        version: 1,
        fuente: 'Localidades de Bogotá D.C. (Acuerdo 117 de 2003, Secretaría Distrital de Planeación). Simplificado a ~55 m.',
        localidades: Object.fromEntries(ORDEN.map((nombre) => [nombre, localidades[nombre]]))
    };

    fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
    fs.writeFileSync(DESTINO, JSON.stringify(salida));

    console.log(`Escrito ${DESTINO}`);
    console.log(`Localidades: ${Object.keys(salida.localidades).length}`);
    console.log(`Vértices: ${Object.values(salida.localidades).flat(2).length}`);
    console.log(`Tamaño: ${(fs.statSync(DESTINO).size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
