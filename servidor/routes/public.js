/**
 * @file Rutas públicas.
 *
 * Salud de la API, eventos SSE y configuración visible para los
 * clientes. Se monta en `/api`.
 *
 * @module routes/public
 */

const express = require('express');
const publicRepo = require('../repositories/public');
const {
    permitirTokenEnQuery,
    requiereSesion
} = require('../lib/auth');
const { agregarCliente, quitarCliente } = require('../lib/eventos');

const router = express.Router();

/*
=========================================================
PRUEBA
=========================================================
*/

router.get('/prueba', async (_req, res) => {

    try {

        const ahora = await publicRepo.ahora();

        res.json({
            ok: true,
            mensaje: 'Conexión correcta con PostgreSQL.',
            ahora
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo conectar a PostgreSQL.'
        });
    }
});

router.get(
    '/eventos',
    permitirTokenEnQuery,
    requiereSesion,
    (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        res.write(`data: ${JSON.stringify({ tipo: 'conectado', fecha: new Date().toISOString() })}\n\n`);
        agregarCliente(res, req.usuarioAutenticado);

    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        quitarCliente(res);
    });
});

router.get('/configuracion/publica', async (_req, res) => {
    try {
        const configuracion = await publicRepo.configuracionPublica();
        res.json({
            ok: true,
            configuracion
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al cargar la configuración.'
        });
    }
});

module.exports = router;
