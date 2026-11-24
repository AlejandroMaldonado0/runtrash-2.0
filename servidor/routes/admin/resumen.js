/**
 * @file Resumen del panel administrativo.
 *
 * @module routes/admin/resumen
 */

const express = require('express');
const adminRepo = require('../../repositories/admin');
const { requiereAdmin } = require('../../lib/auth');

const router = express.Router();

router.get('/admin/resumen', requiereAdmin, async (_req, res) => {
    try {
        const datos = await adminRepo.resumen();

        res.json({
            ok: true,
            ...datos
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al cargar el resumen.'
        });
    }
});

module.exports = router;
