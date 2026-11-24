/**
 * @file Consulta y alta de operarios de una empresa.
 *
 * La empresa solo ve y crea operarios dentro de su propia organización.
 * El código se deriva del NIT de la empresa y no se acepta el valor que
 * envíe el cliente, de modo que siempre sean los últimos cuatro dígitos.
 *
 * @module routes/empresa/operarios
 */

const express = require('express');
const empresaRepo = require('../../repositories/empresa');
const adminRepo = require('../../repositories/admin');
const { requiereEmpresa } = require('../../lib/auth');
const {
    hashPassword,
    validarPassword,
    generarCodigoVerificacion
} = require('../../lib/security');
const { codigoOperarioDesdeNit } = require('../../lib/nit');
const { rotarCodigoVerificacion } = require('../../services/operarios');
const { LOCALIDADES } = require('../../config');

const router = express.Router();

/**
 * Resuelve la empresa sobre la que opera la petición.
 *
 * @param {import('express').Request} req - Petición autenticada.
 * @returns {{empresaId: number|null, error: string|null}} Empresa o error.
 */
function empresaDeLaPeticion(req) {
    if (req.usuarioAutenticado.tipo_usuario === 'admin') {
        const solicitada = req.query.empresa_id || req.body.empresa_id;
        const empresaId = solicitada ? Number(solicitada) : null;

        return {
            empresaId: Number.isInteger(empresaId) && empresaId > 0
                ? empresaId
                : null,
            error: null
        };
    }

    if (!req.usuarioAutenticado.empresa_id) {
        return {
            empresaId: null,
            error: 'Tu cuenta no está asociada a una empresa.'
        };
    }

    return {
        empresaId: req.usuarioAutenticado.empresa_id,
        error: null
    };
}

router.get('/operarios', requiereEmpresa, async (req, res) => {

    try {

        const { empresaId, error } = empresaDeLaPeticion(req);

        /*
        El administrador puede listar todos dejando `empresa_id`
        vacío. Una empresa siempre queda limitada a su propio id.
        */
        if (error) {
            return res.status(403).json({
                ok: false,
                mensaje: error
            });
        }

        const operarios = await empresaRepo.listarOperarios(empresaId);

        return res.json({
            ok: true,
            operarios
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false,
            mensaje:
                'Error al cargar los operarios.'
        });
    }
});

router.post('/operarios', requiereEmpresa, async (req, res) => {
    try {
        const { empresaId, error } = empresaDeLaPeticion(req);

        if (error || !empresaId) {
            return res.status(403).json({
                ok: false,
                mensaje: error || 'Selecciona una empresa válida.'
            });
        }

        const {
            nombre,
            correo,
            password,
            zona_asignada
        } = req.body;

        if (!nombre || !correo || !password) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Completa nombre, correo y contraseña.'
            });
        }

        const validacionPassword = validarPassword(password);

        if (!validacionPassword.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
            });
        }

        if (!zona_asignada || !LOCALIDADES.has(String(zona_asignada).trim())) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Selecciona una localidad válida para el operario.'
            });
        }

        /*
        La empresa se toma del token (o del `empresa_id` que elige un
        administrador). No se acepta un NIT del cuerpo: una empresa no
        puede crear operarios en otra organización enviando su NIT.
        */
        const empresa = await adminRepo.obtenerEmpresa({ empresaId });

        if (!empresa) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Empresa no encontrada.'
            });
        }

        const codigoOperario = codigoOperarioDesdeNit(empresa.nit);

        if (!codigoOperario) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El NIT de la empresa no permite derivar el código de operario.'
            });
        }

        /*
        Cada operario recibe además un código de seis dígitos que la
        empresa entrega en persona. Se guarda hasheado y solo se muestra
        en esta respuesta.
        */
        const codigoVerificacion = generarCodigoVerificacion();

        const correoNormalizado = String(correo).trim().toLowerCase();
        const existe = await adminRepo.buscarUsuarioPorCorreo(correoNormalizado);

        if (existe) {
            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        const usuario = await adminRepo.crearUsuario({
            nombre: String(nombre).trim(),
            correo: correoNormalizado,
            passwordHash: hashPassword(password),
            tipoUsuario: 'operario',
            codigoOperario,
            codigoVerificacionHash: hashPassword(codigoVerificacion),
            zonaAsignada: String(zona_asignada).trim(),
            empresaId: empresa.id,
            nitEmpresa: empresa.nit
        });

        return res.status(201).json({
            ok: true,
            mensaje:
                'Operario creado. Entrega a ' + usuario.nombre +
                ' el código de verificación; no volverá a mostrarse.',
            usuario,
            codigo_verificacion: codigoVerificacion
        });
    } catch (error) {
        console.error(error);

        if (error.code === '23505') {
            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        if (error.code === '23514') {
            return res.status(400).json({
                ok: false,
                mensaje: error.message
            });
        }

        res.status(500).json({
            ok: false,
            mensaje: 'Error al crear el operario.'
        });
    }
});

/**
 * Genera un código de verificación nuevo para un operario de la empresa.
 *
 * El código se devuelve una sola vez; en la base solo queda su hash y
 * se revocan las sesiones abiertas del operario.
 */
router.post('/operarios/:id/codigo-verificacion', requiereEmpresa, async (req, res) => {
    try {
        const { empresaId, error } = empresaDeLaPeticion(req);
        const operarioId = Number(req.params.id);

        if (error || !empresaId) {
            return res.status(403).json({
                ok: false,
                mensaje: error || 'Selecciona una empresa válida.'
            });
        }

        if (!Number.isInteger(operarioId) || operarioId <= 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Operario no válido.'
            });
        }

        const operario = await empresaRepo.buscarOperarioDeEmpresa(
            operarioId,
            empresaId
        );

        if (!operario) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Operario no encontrado en tu empresa.'
            });
        }

        const codigo = await rotarCodigoVerificacion(operario);

        return res.json({
            ok: true,
            mensaje:
                'Código generado. Compártelo solo con el operario; ' +
                'no volverá a mostrarse.',
            codigo_verificacion: codigo
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo generar el código de verificación.'
        });
    }
});

module.exports = router;
