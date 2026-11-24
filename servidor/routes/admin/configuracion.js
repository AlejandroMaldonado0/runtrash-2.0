/**
 * @file Configuración del sistema.
 *
 * @module routes/admin/configuracion
 */

const express = require('express');
const adminRepo = require('../../repositories/admin');
const { requiereAdmin } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');

const router = express.Router();

router.get('/admin/configuracion', requiereAdmin, async (_req, res) => {
    try {
        const configuracion = await adminRepo.listarConfiguracion();
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

router.put('/admin/configuracion', requiereAdmin, async (req, res) => {
    try {
        const permitidas = {
            limite_reportes_diarios: [1, 20],
            limite_ruta: [1, 50],
            retencion_dias: [1, 365],
            distancia_gps_maxima: [5, 100]
        };
        const incoming = req.body || {};

        for (const [clave, valor] of Object.entries(incoming)) {
            if (!permitidas[clave]) continue;
            const numero = Number(valor);
            const [minimo, maximo] = permitidas[clave];
            if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
                return res.status(400).json({
                    ok: false,
                    mensaje: `El valor de ${clave} está fuera del rango permitido.`
                });
            }
            await adminRepo.guardarConfiguracion(
                clave,
                String(numero),
                req.usuarioAutenticado.id
            );
        }

        emitirEvento('configuracion_actualizada');
        const configuracion = await adminRepo.listarConfiguracion();
        res.json({
            ok: true,
            mensaje: 'Configuración actualizada.',
            configuracion
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al guardar la configuración.'
        });
    }
});

module.exports = router;
