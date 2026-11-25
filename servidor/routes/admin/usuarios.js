/**
 * @file Gestión administrativa de usuarios.
 *
 * Las cuentas privilegiadas no se autorregistran: las crea un
 * administrador. El código de un operario se deriva siempre del NIT de
 * su empresa (últimos cuatro dígitos) y nunca se acepta el valor que
 * envíe el cliente.
 *
 * @module routes/admin/usuarios
 */

const express = require('express');
const adminRepo = require('../../repositories/admin');
const { requiereAdmin } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');
const { notificarUsuarios, idsPorRol } = require('../../lib/notificaciones');
const {
    hashPassword,
    validarPassword,
    generarCodigoVerificacion
} = require('../../lib/security');
const { rotarCodigoVerificacion } = require('../../services/operarios');
const {
    normalizarNit,
    codigoOperarioDesdeNit
} = require('../../lib/nit');

const router = express.Router();

/** Roles que se pueden crear o editar desde el panel. */
const ROLES_PERMITIDOS = new Set([
    'ciudadano',
    'operario',
    'empresa',
    'distrito',
    'policia',
    'sspd',
    'admin'
]);

/**
 * Determina si el usuario autenticado es el administrador principal, es
 * decir, la cuenta inicial creada desde `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
 *
 * @param {object} usuario - Usuario cargado desde la sesión.
 * @returns {boolean} `true` solo para el administrador principal.
 */
function esAdministradorPrincipal(usuario) {
    if (usuario?.tipo_usuario !== 'admin') return false;

    const correoPrincipal = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const correoUsuario = String(usuario?.correo || '').trim().toLowerCase();

    return Boolean(correoPrincipal) && correoUsuario === correoPrincipal;
}

/**
 * Resuelve y valida la empresa asociada a una cuenta.
 *
 * @param {object} datos
 * @param {string} datos.tipoUsuario - Rol que se está guardando.
 * @param {number|string|null} datos.empresaId - Empresa explícita.
 * @param {string|null} datos.nitEmpresa - NIT enviado.
 * @param {string} datos.nombre - Nombre de la empresa (solo alta).
 * @param {string} datos.correo - Correo de la empresa (solo alta).
 * @returns {Promise<{empresaId: number|null, nitEmpresa: string|null, empresa: object|null}>}
 * @throws {Error} Con `status` 400 si faltan datos o la empresa no existe.
 */
async function resolverEmpresa({
    tipoUsuario,
    empresaId = null,
    nitEmpresa = null,
    nombre = '',
    correo = ''
}) {
    if (!['empresa', 'operario'].includes(tipoUsuario)) {
        return { empresaId: null, nitEmpresa: null, empresa: null };
    }

    const nit = normalizarNit(nitEmpresa);

    if (tipoUsuario === 'empresa') {
        if (!nit) {
            const error = new Error('La empresa necesita un NIT.');
            error.status = 400;
            throw error;
        }

        const empresaIdCreada = empresaId
            ? empresaId
            : await adminRepo.asegurarEmpresa({
                nombre: String(nombre).trim(),
                nit,
                correo
            });

        const empresa = await adminRepo.obtenerEmpresa({
            empresaId: empresaIdCreada
        });

        return {
            empresaId: empresaIdCreada,
            nitEmpresa: empresa?.nit || nit,
            empresa
        };
    }

    /*
    El NIT tiene prioridad sobre el id: si el administrador escribe el
    NIT de otra empresa, el operario debe moverse a esa empresa y no
    quedarse en la anterior por enviar también su `empresa_id`.
    */
    const empresa = nit
        ? await adminRepo.obtenerEmpresa({ nit })
        : await adminRepo.obtenerEmpresa({
            empresaId: empresaId ? Number(empresaId) : null
        });

    if (!empresa) {
        const error = new Error(
            'Asocia el operario a una empresa registrada (empresa_id o NIT).'
        );
        error.status = 400;
        throw error;
    }

    return {
        empresaId: empresa.id,
        nitEmpresa: empresa.nit,
        empresa
    };
}

/**
 * Convierte errores de PostgreSQL en respuestas HTTP comprensibles.
 *
 * @param {Error} error - Error capturado.
 * @param {import('express').Response} res - Respuesta express.
 * @returns {boolean} `true` si ya se respondió.
 */
function responderErrorBaseDatos(error, res) {
    if (error.code === '23505') {
        res.status(409).json({
            ok: false,
            mensaje: 'El correo, NIT o código ya está registrado.'
        });
        return true;
    }

    if (error.code === '23514') {
        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
        return true;
    }

    return false;
}

router.get('/admin/usuarios', requiereAdmin, async (_req, res) => {
    try {
        const usuarios = await adminRepo.listarUsuarios();

        res.json({
            ok: true,
            usuarios
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al cargar los usuarios.'
        });
    }
});

router.post('/admin/usuarios', requiereAdmin, async (req, res) => {
    try {
        const {
            nombre,
            correo,
            password,
            tipo_usuario,
            zona_asignada,
            empresa_id,
            nit_empresa
        } = req.body;

        if (!nombre || !correo || !password || !ROLES_PERMITIDOS.has(tipo_usuario)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Completa los datos obligatorios.'
            });
        }

        /*
        Solo el administrador principal (definido por `ADMIN_EMAIL`) puede
        otorgar el rol de administrador. Los demás administradores creados
        desde el panel no pueden volver a administrar.
        */
        if (tipo_usuario === 'admin' && !esAdministradorPrincipal(req.usuarioAutenticado)) {
            return res.status(403).json({
                ok: false,
                mensaje: 'Solo el administrador principal puede otorgar el rol de administrador.'
            });
        }

        const validacionPassword = validarPassword(password);

        if (!validacionPassword.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
            });
        }

        if (tipo_usuario === 'operario' && !zona_asignada) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El operario necesita una localidad asignada.'
            });
        }

        const correoNormalizado = String(correo).trim().toLowerCase();
        const existe = await adminRepo.buscarUsuarioPorCorreo(correoNormalizado);

        if (existe) {
            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        const empresa = await resolverEmpresa({
            tipoUsuario: tipo_usuario,
            empresaId: empresa_id,
            nitEmpresa: nit_empresa,
            nombre: String(nombre).trim(),
            correo: correoNormalizado
        });

        const codigoOperario = tipo_usuario === 'operario'
            ? codigoOperarioDesdeNit(empresa.nitEmpresa)
            : null;

        if (tipo_usuario === 'operario' && !codigoOperario) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El NIT de la empresa no permite derivar el código de operario.'
            });
        }

        const codigoVerificacion = tipo_usuario === 'operario'
            ? generarCodigoVerificacion()
            : null;

        const usuario = await adminRepo.crearUsuario({
            nombre: String(nombre).trim(),
            correo: correoNormalizado,
            passwordHash: hashPassword(password),
            tipoUsuario: tipo_usuario,
            codigoOperario,
            codigoVerificacionHash: tipo_usuario === 'operario'
                ? hashPassword(codigoVerificacion)
                : null,
            zonaAsignada: tipo_usuario === 'operario'
                ? String(zona_asignada).trim()
                : null,
            empresaId: empresa.empresaId,
            nitEmpresa: empresa.nitEmpresa
        });

        emitirEvento('usuario_creado', { usuario_id: usuario.id }, {
            roles: ['admin']
        });

        await notificarUsuarios(
            await idsPorRol('admin'),
            {
                tipo: 'admin',
                titulo: 'Nuevo usuario creado',
                mensaje: `${usuario.nombre} (${usuario.tipo_usuario}).`,
                referenciaTipo: 'usuario',
                referenciaId: usuario.id
            }
        );

        res.status(201).json({
            ok: true,
            mensaje: tipo_usuario === 'operario'
                ? 'Usuario creado. Entrega el código de verificación al operario; no volverá a mostrarse.'
                : 'Usuario creado correctamente.',
            usuario,
            codigo_verificacion: tipo_usuario === 'operario'
                ? codigoVerificacion
                : null
        });
    } catch (error) {
        console.error(error);

        if (error.status) {
            return res.status(error.status).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (responderErrorBaseDatos(error, res)) return;

        res.status(500).json({
            ok: false,
            mensaje: 'Error al crear el usuario.'
        });
    }
});

router.put('/admin/usuarios/:id', requiereAdmin, async (req, res) => {
    try {
        const usuarioId = Number(req.params.id);
        const {
            nombre,
            correo,
            tipo_usuario,
            zona_asignada,
            empresa_id,
            nit_empresa
        } = req.body;

        if (!nombre || !correo || !ROLES_PERMITIDOS.has(tipo_usuario)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Completa los datos obligatorios.'
            });
        }

        /*
        Solo el administrador principal (definido por `ADMIN_EMAIL`) puede
        otorgar el rol de administrador. Los demás administradores creados
        desde el panel no pueden volver a administrar.
        */
        if (tipo_usuario === 'admin' && !esAdministradorPrincipal(req.usuarioAutenticado)) {
            return res.status(403).json({
                ok: false,
                mensaje: 'Solo el administrador principal puede otorgar el rol de administrador.'
            });
        }

        const actual = await adminRepo.obtenerTipoUsuario(usuarioId);

        if (!actual || actual.tipo_usuario === 'admin') {
            return res.status(403).json({
                ok: false,
                mensaje: 'Este usuario no se puede editar desde el panel.'
            });
        }

        if (tipo_usuario === 'operario' && !zona_asignada) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El operario necesita una localidad asignada.'
            });
        }

        const correoNormalizado = String(correo).trim().toLowerCase();
        const existe = await adminRepo.buscarUsuarioPorCorreo(
            correoNormalizado,
            usuarioId
        );

        if (existe) {
            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        /*
        Si se edita una empresa y cambia el NIT, hay que actualizar la
        fila de `empresas` y recalcular los códigos de sus operarios.
        */
        if (tipo_usuario === 'empresa' && actual.empresa_id) {
            const nitNuevo = normalizarNit(nit_empresa);

            if (nitNuevo && nitNuevo !== actual.nit_empresa) {
                await adminRepo.actualizarEmpresa(actual.empresa_id, {
                    nombre: String(nombre).trim(),
                    nit: nitNuevo,
                    correo: correoNormalizado
                });
            }
        }

        const empresa = await resolverEmpresa({
            tipoUsuario: tipo_usuario,
            empresaId: empresa_id || actual.empresa_id,
            nitEmpresa: nit_empresa || actual.nit_empresa,
            nombre: String(nombre).trim(),
            correo: correoNormalizado
        });

        const codigoOperario = tipo_usuario === 'operario'
            ? codigoOperarioDesdeNit(empresa.nitEmpresa)
            : null;

        if (tipo_usuario === 'operario' && !codigoOperario) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El NIT de la empresa no permite derivar el código de operario.'
            });
        }

        /*
        El código de verificación pertenece a la empresa. Si el operario
        cambia de empresa o de rol, se borra para que la nueva empresa
        (o el administrador) emita uno nuevo.
        */
        const cambioRol = actual.tipo_usuario !== tipo_usuario;
        const cambioEmpresa = String(actual.empresa_id || '')
            !== String(empresa.empresaId || '');
        const limpiarCodigo = tipo_usuario !== 'operario'
            || cambioRol
            || cambioEmpresa;

        const usuario = await adminRepo.actualizarUsuario({
            nombre: String(nombre).trim(),
            correo: correoNormalizado,
            tipoUsuario: tipo_usuario,
            codigoOperario,
            zonaAsignada: tipo_usuario === 'operario'
                ? String(zona_asignada).trim()
                : null,
            empresaId: empresa.empresaId,
            nitEmpresa: empresa.nitEmpresa,
            actualizarCodigoVerificacion: limpiarCodigo,
            codigoVerificacionHash: null,
            usuarioId
        });

        /*
        Un cambio de correo, rol o empresa debe invalidar las sesiones
        abiertas: de lo contrario el token anterior conserva los
        privilegios viejos hasta que expire.
        */
        const cambioSensible = actual.correo !== correoNormalizado
            || actual.tipo_usuario !== tipo_usuario
            || String(actual.empresa_id || '') !== String(empresa.empresaId || '')
            || String(actual.codigo_operario || '') !== String(codigoOperario || '')
            || String(actual.nit_empresa || '') !== String(empresa.nitEmpresa || '')
            || String(actual.zona_asignada || '') !== String(zona_asignada || '')
            || limpiarCodigo;

        if (cambioSensible) {
            await adminRepo.eliminarSesiones(usuarioId);
        }

        emitirEvento('usuario_actualizado', { usuario_id: usuarioId }, {
            roles: ['admin']
        });

        await notificarUsuarios(
            await idsPorRol('admin'),
            {
                tipo: 'admin',
                titulo: 'Usuario actualizado',
                mensaje: `Cambios en ${usuario.nombre}.`,
                referenciaTipo: 'usuario',
                referenciaId: usuarioId
            }
        );

        res.json({
            ok: true,
            mensaje: 'Usuario actualizado correctamente.',
            usuario
        });
    } catch (error) {
        console.error(error);

        if (error.status) {
            return res.status(error.status).json({
                ok: false,
                mensaje: error.message
            });
        }

        if (responderErrorBaseDatos(error, res)) return;

        res.status(500).json({
            ok: false,
            mensaje: 'Error al actualizar el usuario.'
        });
    }
});

/**
 * Genera un código de verificación nuevo para un operario.
 */
router.post('/admin/usuarios/:id/codigo-verificacion', requiereAdmin, async (req, res) => {
    try {
        const usuarioId = Number(req.params.id);

        if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Usuario no válido.'
            });
        }

        const usuario = await adminRepo.obtenerTipoUsuario(usuarioId);

        if (!usuario || usuario.tipo_usuario !== 'operario') {
            return res.status(404).json({
                ok: false,
                mensaje: 'El código de verificación solo aplica a operarios.'
            });
        }

        const codigo = await rotarCodigoVerificacion(usuario);

        res.json({
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

router.put('/admin/usuarios/:id/password', requiereAdmin, async (req, res) => {
    try {
        const usuarioId = Number(req.params.id);
        const password = String(req.body.password || '');
        const validacionPassword = validarPassword(password);

        if (!validacionPassword.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
            });
        }

        const usuario = await adminRepo.actualizarPassword(
            usuarioId,
            hashPassword(password)
        );

        if (!usuario) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Usuario no encontrado.'
            });
        }

        await adminRepo.eliminarSesiones(usuarioId);

        res.json({
            ok: true,
            mensaje: 'Contraseña actualizada correctamente.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al actualizar la contraseña.'
        });
    }
});

router.patch('/admin/usuarios/:id/estado', requiereAdmin, async (req, res) => {
    try {
        const usuarioId = Number(req.params.id);
        const activo = Boolean(req.body.activo);

        if (usuarioId === req.usuarioAutenticado.id && !activo) {
            return res.status(400).json({
                ok: false,
                mensaje: 'No puedes desactivar tu propia cuenta.'
            });
        }

        const usuario = await adminRepo.actualizarActivo(usuarioId, activo);

        if (!usuario) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Usuario no encontrado.'
            });
        }

        if (!activo) {
            await adminRepo.eliminarSesiones(usuarioId);
        }

        emitirEvento('usuario_actualizado', { usuario_id: usuarioId, activo }, {
            roles: ['admin']
        });

        await notificarUsuarios(
            await idsPorRol('admin'),
            {
                tipo: 'admin',
                titulo: activo ? 'Usuario activado' : 'Usuario desactivado',
                mensaje: usuario.nombre,
                referenciaTipo: 'usuario',
                referenciaId: usuarioId
            }
        );

        if (!activo) {
            await notificarUsuarios([usuarioId], {
                tipo: 'cuenta',
                titulo: 'Tu cuenta fue desactivada',
                mensaje: 'Contacta al administrador de RunTrash.'
            });
        }

        res.json({
            ok: true,
            mensaje: activo ? 'Usuario activado.' : 'Usuario desactivado.',
            usuario
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            mensaje: 'Error al actualizar el usuario.'
        });
    }
});

module.exports = router;
