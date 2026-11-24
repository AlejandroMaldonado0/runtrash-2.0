/**
 * @file Rutas del perfil personal.
 *
 * Expone el resumen de reportes que alimenta el cuadro del modal de
 * perfil y la actualización de la foto. Se monta bajo `/api`, así que
 * las rutas finales son `/api/perfil/resumen` y `/api/perfil/avatar`.
 *
 * @module routes/perfil
 */

const express = require('express');
const perfilRepo = require('../repositories/perfil');
const { requiereSesion } = require('../lib/auth');

const router = express.Router();

/** Tamaño máximo del data URL del avatar (caracteres). */
const AVATAR_MAXIMO = 420000;

/**
 * Formatos aceptados para la foto de perfil.
 *
 * Se excluye SVG a propósito: puede contener scripts y no hace falta
 * porque el navegador siempre envía WEBP, PNG o JPEG recortado.
 *
 * @type {RegExp}
 */
const FORMATO_AVATAR = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Devuelve el conteo de reportes del usuario y los últimos de cada
 * estado. El alcance se calcula por rol en el repositorio.
 */
router.get('/perfil/resumen', requiereSesion, async (req, res) => {
    try {
        const resumen = await perfilRepo.resumenReportes(
            req.usuarioAutenticado
        );

        res.json({
            ok: true,
            resumen,
            avatar: req.usuarioAutenticado.avatar_url || null
        });
    } catch (error) {
        console.error('Error cargando resumen del perfil:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo cargar el resumen de reportes.'
        });
    }
});

/**
 * Guarda la foto de perfil.
 *
 * El cliente envía un data URL ya recortado y reducido. El servidor
 * valida formato y tamaño antes de escribir para no almacenar HTML,
 * SVG ni imágenes gigantes.
 */
router.put('/perfil/avatar', requiereSesion, async (req, res) => {
    try {
        const avatar = req.body?.avatar;

        if (avatar !== null && typeof avatar !== 'string') {
            return res.status(400).json({
                ok: false,
                mensaje: 'La foto enviada no es válida.'
            });
        }

        const normalizado = String(avatar || '').trim();

        if (normalizado === '') {
            const guardado = await perfilRepo.actualizarAvatar(
                req.usuarioAutenticado.id,
                null
            );

            return res.json({
                ok: true,
                mensaje: 'Foto de perfil eliminada.',
                avatar: guardado
            });
        }

        if (normalizado.length > AVATAR_MAXIMO) {
            return res.status(413).json({
                ok: false,
                mensaje: 'La foto es demasiado grande. Elige una más pequeña.'
            });
        }

        if (!FORMATO_AVATAR.test(normalizado)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La foto debe ser una imagen PNG, JPG o WEBP.'
            });
        }

        const guardado = await perfilRepo.actualizarAvatar(
            req.usuarioAutenticado.id,
            normalizado
        );

        res.json({
            ok: true,
            mensaje: 'Foto de perfil actualizada.',
            avatar: guardado
        });
    } catch (error) {
        console.error('Error guardando foto de perfil:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo guardar la foto de perfil.'
        });
    }
});

module.exports = router;
