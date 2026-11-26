/**
 * @file Consultas de reportes por ciudadano, operario y empresa.
 *
 * @module routes/reportes/consultas
 */

const express = require('express');
const reportesRepo = require('../../repositories/reportes');
const empresaRepo = require('../../repositories/empresa');
const {
    requiereCiudadano,
    requiereOperario,
    requiereEmpresa
} = require('../../lib/auth');

const router = express.Router();

/*
=========================================================
REPORTES DE UN CIUDADANO
=========================================================
*/

router.get('/reportes/usuario/:usuarioId',
    requiereCiudadano,
    async (req, res) => {

        try {

            const usuarioId =
                Number(req.params.usuarioId);

            if (usuarioId !== req.usuarioAutenticado.id) {
                return res.status(403).json({
                    ok: false,
                    mensaje: 'Solo puedes consultar tus propios reportes.'
                });
            }

            const reportes = await reportesRepo.listarPorUsuario(usuarioId);

            res.json({
                ok: true,
                reportes
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                ok: false,
                mensaje:
                    'Error al cargar tus reportes.'
            });
        }
    }
);

/*
=========================================================
REPORTES DE UN OPERARIO
=========================================================
*/

router.get('/reportes/operario/:operarioId',
    requiereOperario,
    async (req, res) => {

        try {

            const operarioId =
                Number(req.params.operarioId);

            if (operarioId !== req.usuarioAutenticado.id) {
                return res.status(403).json({
                    ok: false,
                    mensaje: 'Solo puedes consultar tus propios reportes.'
                });
            }

            const reportes = await reportesRepo.listarPorOperario(operarioId);

            res.json({
                ok: true,
                reportes
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                ok: false,
                mensaje:
                    'Error al cargar los reportes asignados.'
            });
        }
    }
);

/*
=========================================================
TODOS LOS REPORTES
=========================================================
*/

router.get('/reportes', requiereEmpresa, async (req, res) => {

    try {

        const usuario = req.usuarioAutenticado;

        /*
        El administrador conserva visión global. Una empresa solo ve
        los reportes asignados a sus operarios y los libres de las
        localidades que atiende; nunca los de otra empresa.
        */
        if (usuario.tipo_usuario === 'admin') {
            const reportes = await reportesRepo.listarTodos();

            return res.json({
                ok: true,
                reportes
            });
        }

        if (!usuario.empresa_id) {
            return res.status(403).json({
                ok: false,
                mensaje: 'Tu cuenta no está asociada a una empresa.'
            });
        }

        const reportes = await reportesRepo.listarTodos();

        res.json({
            ok: true,
            reportes
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje:
                'Error al cargar los reportes.'
        });
    }
});

module.exports = router;
