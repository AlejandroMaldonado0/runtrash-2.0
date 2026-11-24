/**
 * @file Actualización del estado de un reporte por el operario.
 *
 * La ruta valida el estado recibido y delega el cambio en
 * `services/reportes`. Las notificaciones al ciudadano y a la empresa
 * se envían en paralelo.
 *
 * @module routes/empresa/estado
 */

const express = require('express');
const reportesService = require('../../services/reportes');
const { esErrorServicio } = require('../../services/errores');
const { requiereOperario } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');
const { notificarUsuarios, idsPorRol } = require('../../lib/notificaciones');
const { enParaleloSeguro } = require('../../lib/concurrencia');
const upload = require('../../lib/upload');
const almacen = require('../../lib/almacen');

const router = express.Router();

router.put('/reportes/:id/estado',
    requiereOperario,
    upload.single('foto'),
    async (req, res) => {

        try {

            const reporteId =
                Number(req.params.id);

            const estado = String(req.body?.estado || '').trim().toLowerCase();
            const operadorId = req.usuarioAutenticado.id;

            /*
            El operario puede elegir libremente entre "en proceso" y
            "completado", incluso regresando si se equivocó.
            "pendiente" sigue siendo el estado inicial de todo reporte
            asignado y por eso no se permite fijarlo desde aquí.
            */
            let imagenOperarioUrl = null;

            if (estado === 'completado') {

                /*
                Al completar, el operario debe adjuntar la foto de
                evidencia de la recolección. Esa foto viaja junto con el
                estado y se guarda en el reporte; la foto del ciudadano
                sigue viva en `imagen_url`.
                */
                if (!req.file) {
                    return res.status(400).json({
                        ok: false,
                        mensaje:
                            'Debes adjuntar una foto del operario al completar el reporte.'
                    });
                }

                const extension = String(
                    (req.file.originalname || '').split('.').pop() || 'jpg'
                ).toLowerCase();
                const clave = await almacen.guardar(
                    req.file.buffer,
                    `.${extension}`
                );
                imagenOperarioUrl = `/uploads/${clave}`;
            }

            const actualizado = await reportesService.cambiarEstadoReporte({
                reporteId,
                operarioId: operadorId,
                estado,
                imagenOperarioUrl
            });

            const empresaId = req.usuarioAutenticado.empresa_id;

            emitirEvento('estado_actualizado', {
                reporte_id: reporteId,
                estado,
                operario_id: operadorId
            }, {
                usuarios: [actualizado.usuario_id, operadorId],
                roles: ['admin'],
                empresaId
            });

            const esCompletado = estado === 'completado';
            const localidad = actualizado.localidad || 'sin localidad';

            const destinatariosEmpresa = empresaId
                ? await idsPorRol('empresa', { empresaId })
                : [];

            /*
            Ciudadano y empresa son destinatarios independientes: si
            una notificación falla, la otra ya se intentó igualmente.
            */
            await enParaleloSeguro([
                () => notificarUsuarios([actualizado.usuario_id], {
                    tipo: 'estado',
                    titulo: esCompletado
                        ? 'Tu reporte fue completado'
                        : 'Tu reporte vuelve a estar en proceso',
                    mensaje: `${actualizado.tipo} en ${localidad}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                }),
                () => notificarUsuarios(destinatariosEmpresa, {
                    tipo: 'estado',
                    titulo: esCompletado ? 'Reporte completado' : 'Reporte en proceso',
                    mensaje: `${actualizado.tipo} en ${localidad}.`,
                    referenciaTipo: 'reporte',
                    referenciaId: reporteId
                })
            ]);

            res.json({
                ok: true,
                mensaje:
                    'Estado actualizado correctamente.',
                reporte:
                    actualizado
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
                    'Error al actualizar el estado.'
            });
        }
    }
);

module.exports = router;
