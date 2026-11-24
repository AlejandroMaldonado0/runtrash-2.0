/**
 * @file Almacenamiento de imágenes de los reportes.
 *
 * Elige automáticamente entre dos modos:
 *
 * 1. Disco local (desarrollo y pruebas): `STORAGE_PROVIDER` vacío o
 *    `local`. Las imágenes quedan en `servidor/uploads`.
 * 2. Neon Object Storage (producción, compatible con S3): se activa con
 *    `STORAGE_PROVIDER=s3` más endpoint, bucket y credenciales.
 *
 * En ambos casos la API guarda el mismo valor en `imagen_url`
 * (`/uploads/nombre.jpg`), así que el frontend no cambia.
 *
 * @module lib/almacen
 */

const fs = require('node:fs');
const path = require('node:path');

const PROVEEDOR = String(process.env.STORAGE_PROVIDER || 'local').toLowerCase();

/**
 * Limpia un valor de entorno (comillas, espacios y saltos de línea).
 *
 * @param {string} valor - Valor crudo de `process.env`.
 * @returns {string} Valor limpio.
 */
function limpiar(valor) {
    return String(valor ?? '')
        .trim()
        .replace(/^["']/, '')
        .replace(/["']$/, '')
        .trim();
}

const configuracionS3 = {
    endpoint: limpiar(process.env.STORAGE_S3_ENDPOINT),
    region: limpiar(process.env.STORAGE_S3_REGION) || 'us-east-2',
    bucket: limpiar(process.env.STORAGE_S3_BUCKET) || 'uploads',
    accessKeyId: limpiar(process.env.STORAGE_S3_ACCESS_KEY_ID),
    secretAccessKey: limpiar(process.env.STORAGE_S3_SECRET_ACCESS_KEY),
    forcePathStyle: limpiar(process.env.STORAGE_S3_FORCE_PATH_STYLE) !== 'false'
};

const faltaConfiguracion = [
    ['STORAGE_S3_ENDPOINT', configuracionS3.endpoint],
    ['STORAGE_S3_ACCESS_KEY_ID', configuracionS3.accessKeyId],
    ['STORAGE_S3_SECRET_ACCESS_KEY', configuracionS3.secretAccessKey]
].filter(([, valor]) => !String(valor).trim()).map(([nombre]) => nombre);

/**
 * Indica si el endpoint configurado es una URL HTTP(S) válida.
 * @type {boolean}
 */
const endpointValido = (() => {
    if (!configuracionS3.endpoint) return false;
    try {
        const url = new URL(configuracionS3.endpoint);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
        return false;
    }
})();

const usarS3 = PROVEEDOR === 's3'
    && faltaConfiguracion.length === 0
    && endpointValido;

let clienteS3 = null;

if (PROVEEDOR === 's3') {
    if (faltaConfiguracion.length) {
        console.warn(
            `STORAGE_PROVIDER=s3 pero faltan variables: ${faltaConfiguracion.join(', ')}. `
            + 'Se usara disco local y las imagenes se perderan al redesplegar.'
        );
    } else if (!endpointValido) {
        console.warn(
            `STORAGE_S3_ENDPOINT no es una URL valida: "${configuracionS3.endpoint}". `
            + 'Revisa que no tenga comillas ni espacios. '
            + 'Se usara disco local y las imagenes se perderan al redespliegar.'
        );
    } else {
        const { S3Client } = require('@aws-sdk/client-s3');
        clienteS3 = new S3Client({
            region: configuracionS3.region,
            endpoint: configuracionS3.endpoint,
            forcePathStyle: configuracionS3.forcePathStyle,
            credentials: {
                accessKeyId: configuracionS3.accessKeyId,
                secretAccessKey: configuracionS3.secretAccessKey
            }
        });
    }
}

const directorioLocal = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(directorioLocal)) {
    fs.mkdirSync(directorioLocal, { recursive: true });
}

/*
Nombres de archivo: siempre con la extension ya validada.
Se anteponen carpetas por año/mes para no saturar un solo
directorio cuando haya muchos reportes.
*/
/**
 * Genera una clave única dentro del bucket o del disco local.
 *
 * @param {string} extension - Extensión ya validada (`.jpg`, `.png`, `.webp`).
 * @returns {string} Ruta relativa con formato `AAAA/MM/reporte_xxx.ext`.
 */
function generarNombreArchivo(extension) {
    const marcas = [
        Date.now().toString(36),
        Math.random().toString(36).slice(2, 10)
    ].join('');

    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');

    return `${anio}/${mes}/reporte_${marcas}${extension}`;
}

/**
 * Devuelve el modo de almacenamiento activo.
 *
 * @returns {'s3'|'local'} Modo en uso.
 */
function modo() {
    return usarS3 ? 's3' : 'local';
}

/**
 * Guarda el buffer y devuelve la ruta pública relativa.
 *
 * @param {Buffer} buffer - Contenido de la imagen.
 * @param {string} extension - Extensión validada.
 * @returns {Promise<string>} Clave como `2026/10/reporte_xxx.jpg`.
 */
async function guardar(buffer, extension) {
    const clave = generarNombreArchivo(extension);

    if (usarS3) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        await clienteS3.send(new PutObjectCommand({
            Bucket: configuracionS3.bucket,
            Key: clave,
            Body: buffer,
            ContentType: extension === '.png'
                ? 'image/png'
                : extension === '.webp' ? 'image/webp' : 'image/jpeg'
        }));
        return clave;
    }

    const destino = path.join(directorioLocal, clave);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    await fs.promises.writeFile(destino, buffer);
    return clave;
}

/**
 * Lee una imagen guardada (S3 o disco local).
 *
 * @param {string} clave - Ruta relativa devuelta por `guardar`.
 * @returns {Promise<{cuerpo: Buffer|Uint8Array, tipo: string}>} Bytes y MIME.
 */
async function leer(clave) {
    if (usarS3) {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const resultado = await clienteS3.send(new GetObjectCommand({
            Bucket: configuracionS3.bucket,
            Key: clave
        }));

        /*
        El AWS SDK v3 devuelve Body como un stream legible, no como
        un Buffer. Sin convertirlo, res.send() recibiria un objeto
        vacio y las fotos no se mostrarian.
        */
        return {
            cuerpo: await resultado.Body.transformToByteArray(),
            tipo: resultado.ContentType || 'image/jpeg'
        };
    }

    const origen = path.join(directorioLocal, clave);
    const cuerpo = await fs.promises.readFile(origen);
    const extension = path.extname(clave).toLowerCase();

    return {
        cuerpo,
        tipo: extension === '.png'
            ? 'image/png'
            : extension === '.webp' ? 'image/webp' : 'image/jpeg'
    };
}

/**
 * Elimina una imagen del almacenamiento activo.
 *
 * @param {string} clave - Ruta relativa; se ignora si viene vacía.
 * @returns {Promise<void>}
 */
async function eliminar(clave) {
    if (!clave) return;

    if (usarS3) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        await clienteS3.send(new DeleteObjectCommand({
            Bucket: configuracionS3.bucket,
            Key: clave
        }));
        return;
    }

    const destino = path.join(directorioLocal, clave);
    if (!fs.existsSync(destino)) return;
    await fs.promises.unlink(destino);
}

/**
 * Comprueba que una clave no se escape del directorio de uploads.
 * Bloquea rutas como `../../.env`.
 *
 * @param {string} clave - Ruta recibida desde la URL.
 * @returns {boolean} `true` si es segura.
 */
function claveSegura(clave) {
    const limpio = String(clave || '').replace(/\\/g, '/');
    if (limpio.includes('..')) return false;
    if (limpio.startsWith('/')) return false;
    return limpio.length > 0;
}

/**
 * Resume la configuración de almacenamiento para logs y diagnóstico.
 *
 * @returns {{modo: string, bucket: string|null, region: string|null, faltaConfiguracion: string[]}} Estado.
 */
function resumen() {
    return {
        modo: modo(),
        bucket: usarS3 ? configuracionS3.bucket : null,
        region: usarS3 ? configuracionS3.region : null,
        faltaConfiguracion
    };
}

module.exports = {
    guardar,
    leer,
    eliminar,
    claveSegura,
    modo,
    resumen,
    directorioLocal
};