/**
 * @file Rutas del centro de notificaciones.
 *
 * Lista las notificaciones del usuario autenticado y las marca como
 * leídas. Se monta en `/api/notificaciones`.
 *
 * @module routes/notificaciones
 */

const express = require('express');
const notificacionesRepo = require('../repositories/notificaciones');
const { requiereSesion } = require('../lib/auth');
const { emitirEvento } = require('../lib/eventos');

const router = express.Router();

/*
=========================================================
CENTRO DE NOTIFICACIONES
=========================================================
*/

router.get('/', requiereSesion, async (req, res) => {
    try {
        const usuarioId = req.usuarioAutenticado.id;
        const datos = await notificacionesRepo.listar(usuarioId);

        res.json({
            ok: true,
            notificaciones: datos.notificaciones,
            no_leidas: datos.noLeidas
        });
    } catch (error) {
        console.error('Error listando notificaciones:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudieron cargar las notificaciones.'
        });
    }
});

router.post('/leidas', requiereSesion, async (req, res) => {
    try {
        const marcadas = await notificacionesRepo.marcarLeidas(req.usuarioAutenticado.id);

        emitirEvento('notificaciones_leidas', {
            usuario_id: req.usuarioAutenticado.id
        }, {
            usuarios: [req.usuarioAutenticado.id]
        });

        res.json({
            ok: true,
            mensaje: 'Notificaciones marcadas como leídas.',
            marcadas
        });
    } catch (error) {
        console.error('Error marcando notificaciones:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudieron marcar las notificaciones.'
        });
    }
});

module.exports = router;
