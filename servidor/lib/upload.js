/**
 * @file Configuración de subida de imágenes con Multer.
 *
 * Usa `memoryStorage` para que la imagen viva en memoria hasta que
 * la petición es válida; después `lib/almacen` decide si se escribe
 * en disco local o en Neon Object Storage. Así se evitan archivos
 * huérfanos cuando una validación falla.
 *
 * @module lib/upload
 */

const multer = require('multer');
const { MAX_UPLOAD_MB } = require('../config');

/** Tipos MIME aceptados. */
const TIPOS_PERMITIDOS = new Set([
    'image/jpeg',
    'image/png',
    'image/webp'
]);

/**
 * Instancia de Multer lista para usar como middleware.
 * @type {import('multer').Multer}
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOAD_MB * 1024 * 1024
    },
    fileFilter: (_req, file, callback) => {
        if (TIPOS_PERMITIDOS.has(file.mimetype)) {
            callback(null, true);
            return;
        }

        callback(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'));
    }
});

module.exports = upload;
module.exports.TIPOS_PERMITIDOS = TIPOS_PERMITIDOS;
