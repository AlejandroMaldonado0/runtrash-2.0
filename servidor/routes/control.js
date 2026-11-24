/**
 * @file Rutas de los entes de control (Distrito, Policía y SSPD).
 *
 * Permiten consultar todos los reportes de la ciudad y registrar
 * seguimientos trazables. Cada ente solo puede leer sus propios
 * seguimientos; el administrador conserva la vista global. Se monta en
 * `/api/control`.
 *
 * @module routes/control
 */

const express = require('express');
const controlRepo = require('../repositories/control');
const { requiereEnteControl } = require('../lib/auth');
const { emitirEvento } = require('../lib/eventos');
const { notificarUsuarios, idsPorRol } = require('../lib/notificaciones');

const router = express.Router();

/*
=========================================================
ENTES DE CONTROL (Distrito, Policía, SSPD)
=========================================================
Estos roles no operan los reportes: los supervisan y dejan
seguimientos trazables para verificar que se atiendan.
*/

/** Nombres legibles de cada ente de control. */
const NOMBRES_ENTE = {
    distrito: 'Distrito',
    policia: 'Policía',
    sspd: 'Superintendencia de Servicios Públicos',
    admin: 'Administrador'
};

/** Tipos de seguimiento aceptados. */
const TIPOS_SEGUIMIENTO = new Set([
    'observacion',
    'requerimiento',
    'visita',
    'cierre'
]);

/**
 * Resumen de reportes y seguimientos para el panel de control.
 *
 * Los reportes son visibles para todos los entes; el conteo de
 * seguimientos se limita al ente autenticado.
 */
router.get('/resumen', requiereEnteControl, async (req, res) => {
    try {
        const resumen = await controlRepo.resumen(
            req.usuarioAutenticado.tipo_usuario
        );

        res.json({
            ok: true,
            resumen
        });
    } catch (error) {
        console.error('Error en resumen de control:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo cargar el resumen de control.'
        });
    }
});

/**
 * Lista los reportes con filtros y el conteo de seguimientos propios.
 *
 * Query: estado, localidad, desde, hasta, texto.
 */
router.get('/reportes', requiereEnteControl, async (req, res) => {
    try {
        const reportes = await controlRepo.listarReportes(
            req.query,
            req.usuarioAutenticado.tipo_usuario
        );

        res.json({
            ok: true,
            reportes
        });
    } catch (error) {
        console.error('Error listando reportes de control:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudieron cargar los reportes.'
        });
    }
});

/**
 * Detalle de un reporte con el historial de seguimientos del ente.
 *
 * El reporte es común a todos los entes, pero cada uno solo ve sus
 * propios seguimientos. El administrador ve el historial completo.
 */
router.get('/reportes/:id', requiereEnteControl, async (req, res) => {
    try {
        const reporteId = Number(req.params.id);

        if (!Number.isInteger(reporteId) || reporteId <= 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Reporte no válido.'
            });
        }

        const reporte = await controlRepo.obtenerReporte(reporteId);

        if (!reporte) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Reporte no encontrado.'
            });
        }

        const seguimientos = await controlRepo.listarSeguimientos(
            reporteId,
            req.usuarioAutenticado.tipo_usuario
        );

        res.json({
            ok: true,
            reporte,
            seguimientos
        });
    } catch (error) {
        console.error('Error cargando detalle de control:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo cargar el reporte.'
        });
    }
});

/**
 * Registra un seguimiento de un ente de control sobre un reporte.
 *
 * Body: { tipo, mensaje }
 */
router.post('/reportes/:id/seguimiento', requiereEnteControl, async (req, res) => {
    try {
        const reporteId = Number(req.params.id);
        const tipo = String(req.body.tipo || 'observacion').trim();
        const mensaje = String(req.body.mensaje || '').trim();

        if (!Number.isInteger(reporteId) || reporteId <= 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Reporte no válido.'
            });
        }

        if (!TIPOS_SEGUIMIENTO.has(tipo)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Tipo de seguimiento no válido.'
            });
        }

        if (mensaje.length < 5 || mensaje.length > 1000) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El seguimiento debe tener entre 5 y 1000 caracteres.'
            });
        }

        const reporte = await controlRepo.buscarReporteBasico(reporteId);

        if (!reporte) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Reporte no encontrado.'
            });
        }

        const ente = req.usuarioAutenticado.tipo_usuario;

        const creado = await controlRepo.crearSeguimiento({
            reporteId,
            usuarioId: req.usuarioAutenticado.id,
            ente,
            tipo,
            mensaje,
            estadoReportado: reporte.estado
        });

        emitirEvento('seguimiento_creado', {
            reporte_id: reporteId,
            seguimiento_id: creado.id
        }, {
            usuarios: [reporte.operario_id].filter(Boolean),
            /* Solo el ente autor y administración ven el cambio en vivo. */
            roles: [...new Set(['admin', ente])]
        });

        const destinatarios = [
            reporte.operario_id,
            ...(await idsPorRol('admin'))
        ];

        await notificarUsuarios(destinatarios, {
            tipo: 'seguimiento',
            titulo: `Seguimiento de ${NOMBRES_ENTE[ente] || ente}`,
            mensaje: `Reporte #${reporteId}: ${mensaje.slice(0, 180)}`,
            referenciaTipo: 'reporte',
            referenciaId: reporteId
        });

        res.status(201).json({
            ok: true,
            mensaje: 'Seguimiento registrado.',
            seguimiento: {
                ...creado,
                autor: req.usuarioAutenticado.nombre,
                ente_nombre: NOMBRES_ENTE[ente] || ente
            }
        });
    } catch (error) {
        console.error('Error registrando seguimiento:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo registrar el seguimiento.'
        });
    }
});

module.exports = router;
