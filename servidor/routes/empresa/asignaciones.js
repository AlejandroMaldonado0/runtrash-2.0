/**
 * @file Asignación manual y automática de reportes.
 *
 * Las rutas validan la entrada y delegan en `services/reportes`, que
 * bloquea el reporte dentro de una transacción para evitar asignaciones
 * dobles. Las notificaciones se envían en paralelo.
 *
 * @module routes/empresa/asignaciones
 */

const express = require('express');
const reportesService = require('../../services/reportes');
const { esErrorServicio } = require('../../services/errores');
const { requiereEmpresa } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');
const { notificarUsuarios } = require('../../lib/notificaciones');
const { enParaleloSeguro } = require('../../lib/concurrencia');

const router = express.Router();

router.put('/reportes/:id/asignar',
    requiereEmpresa,
    async (req, res) => {

        try {

            const reporteId =
                Number(req.params.id);

            const {
                operario_id
            } = req.body;

            if (!operario_id) {

                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'Debes seleccionar un operario.'
                });
            }

            const esAdmin = req.usuarioAutenticado.tipo_usuario === 'admin';
            const empresaId = req.usuarioAutenticado.empresa_id;

            const { reporte: asignado, operario } =
                await reportesService.asignarReporte({
                    reporteId,
                    operarioId: Number(operario_id),
                    empresaId,
                    esAdmin
                });

            emitirEvento('reporte_asignado', {
                reporte_id: reporteId,
                operario_id: Number(operario_id)
            }, {
                usuarios: [Number(operario_id), asignado.usuario_id],
                roles: ['admin'],
                empresaId
            });

            const localidad = asignado.localidad || 'sin localidad';

            /*
            El operario y el ciudadano reciben avisos distintos; se
            lanzan a la vez y un fallo parcial no cancela el otro.
            */
            await enParaleloSeguro([
                () => notificarUsuarios([Number(operario_id)], {
                    tipo: 'asignacion',
                    titulo: 'Te asignaron un reporte',
                    mensaje: `${asignado.tipo} en ${localidad}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                }),
                () => notificarUsuarios([asignado.usuario_id], {
                    tipo: 'asignacion',
                    titulo: 'Tu reporte fue asignado',
                    mensaje: `${operario.nombre} atenderá tu reporte.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                })
            ]);

            res.json({
                ok: true,
                mensaje:
                    'Reporte asignado correctamente.',
                reporte:
                    asignado
            });

        } catch (error) {

            console.error(error);

            if (esErrorServicio(error)) {
                return res.status(error.estado).json({
                    ok: false,
                    mensaje: error.message
                });
            }

            res.status(500).json({
                ok: false,
                mensaje:
                    'Error al asignar el reporte.'
            });
        }
    }
);

router.post('/reportes/:id/asignar-automaticamente',
    requiereEmpresa,
    async (req, res) => {

        try {
            const reporteId = Number(req.params.id);
            const esAdmin = req.usuarioAutenticado.tipo_usuario === 'admin';
            const empresaId = req.usuarioAutenticado.empresa_id;

            const { reporte: asignado, operario } =
                await reportesService.asignarAutomaticamente({
                    reporteId,
                    empresaId,
                    esAdmin
                });

            emitirEvento('reporte_asignado', {
                reporte_id: reporteId,
                operario_id: operario.id,
                automatico: true
            }, {
                usuarios: [operario.id, asignado.usuario_id],
                roles: ['admin'],
                empresaId
            });

            const localidad = asignado.localidad || 'sin localidad';

            await enParaleloSeguro([
                () => notificarUsuarios([operario.id], {
                    tipo: 'asignacion',
                    titulo: 'Te asignaron un reporte',
                    mensaje: `${asignado.tipo} en ${localidad}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                }),
                () => notificarUsuarios([asignado.usuario_id], {
                    tipo: 'asignacion',
                    titulo: 'Tu reporte fue asignado',
                    mensaje: `${operario.nombre} atenderá tu reporte.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                })
            ]);

            res.json({
                ok: true,
                mensaje: 'Reporte asignado por localidad y carga disponible.',
                reporte: asignado,
                operario
            });

        } catch (error) {
            console.error(error);

            if (esErrorServicio(error)) {
                return res.status(error.estado).json({
                    ok: false,
                    mensaje: error.message
                });
            }

            res.status(500).json({
                ok: false,
                mensaje: 'No se pudo realizar la asignación automática.'
            });
        }
    }
);

module.exports = router;
