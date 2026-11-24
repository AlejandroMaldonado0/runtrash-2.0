/**
 * @file Inicio y cierre de sesión.
 *
 * El rol real se toma de PostgreSQL. Para operarios y empresas se exige
 * además el segundo factor: el código de operario (últimos cuatro
 * dígitos del NIT de su empresa) o el NIT de la empresa. Las cuentas se
 * bloquean temporalmente tras varios intentos fallidos.
 *
 * @module routes/auth/sesion
 */

const express = require('express');
const crypto = require('crypto');
const authRepo = require('../../repositories/auth');
const {
    verifyPassword,
    compararSeguro,
    hashSessionToken
} = require('../../lib/security');
const {
    normalizarNit,
    soloDigitos,
    codigoOperarioValido
} = require('../../lib/nit');
const { authLimiter } = require('../../lib/limiters');
const { requiereSesion, obtenerToken } = require('../../lib/auth');
const { SESSION_HOURS } = require('../../config');

const router = express.Router();

/** Intentos fallidos antes de bloquear temporalmente una cuenta. */
const MAX_INTENTOS = 5;

/**
 * Indica si una cuenta sigue bloqueada por intentos fallidos.
 *
 * @param {object} usuario - Fila de `buscarUsuarioLogin`.
 * @returns {boolean} `true` si el bloqueo continúa vigente.
 */
function cuentaBloqueada(usuario) {
    return Boolean(
        usuario.bloqueado_hasta
        && new Date(usuario.bloqueado_hasta).getTime() > Date.now()
    );
}

router.post('/login', authLimiter, async (req, res) => {

    try {

        const {
            correo,
            password,
            codigo_operario,
            codigo_verificacion,
            nit_empresa
        } = req.body;

        if (!correo || !password) {

            return res.status(400).json({
                ok: false,
                mensaje:
                    'Correo y contraseña son obligatorios.'
            });
        }

        const correoNormalizado =
            String(correo).trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El correo no tiene un formato válido.'
            });
        }

        const usuario = await authRepo.buscarUsuarioLogin(correoNormalizado);

        if (!usuario) {

            return res.status(401).json({
                ok: false,
                mensaje:
                    'Correo o contraseña incorrectos.'
            });
        }

        if (cuentaBloqueada(usuario)) {
            return res.status(429).json({
                ok: false,
                mensaje:
                    'Demasiados intentos fallidos. Espera unos minutos e intenta nuevamente.'
            });
        }

        if (!verifyPassword(password, usuario.password)) {
            const intentos = await authRepo.registrarIntentoFallido(usuario.id);

            return res.status(401).json({
                ok: false,
                mensaje: intentos.intentos_fallidos >= MAX_INTENTOS
                    ? 'Demasiados intentos fallidos. Espera unos minutos e intenta nuevamente.'
                    : 'Correo o contraseña incorrectos.'
            });
        }

        delete usuario.password;

        if (!usuario.activo) {

            return res.status(403).json({
                ok: false,
                mensaje:
                    'Esta cuenta está desactivada. Contacta al administrador.'
            });
        }

        /*
        Verificación de identidad por rol. El frontend también la pide,
        pero validarla aquí evita que alguien llame la API directamente
        y entre solo con correo y contraseña.
        */
        if (usuario.tipo_usuario === 'operario') {
            const codigoEnviado = String(codigo_operario || '').trim();
            const nitEmpresa = usuario.empresa_nit || usuario.nit_empresa;

            if (!codigoEnviado) {
                return res.status(400).json({
                    ok: false,
                    requiere: 'codigo_operario',
                    rol: 'operario',
                    mensaje: 'Ingresa tu código de operario.'
                });
            }

            if (!usuario.empresa_id || !nitEmpresa) {
                return res.status(403).json({
                    ok: false,
                    rol: 'operario',
                    mensaje:
                        'Tu cuenta aún no está asociada a una empresa. Contacta al administrador.'
                });
            }

            /*
            La fuente de verdad es el NIT de la empresa: el código debe
            ser exactamente sus últimos cuatro dígitos.
            */
            if (!codigoOperarioValido(codigoEnviado, nitEmpresa)) {
                await authRepo.registrarIntentoFallido(usuario.id);

                return res.status(401).json({
                    ok: false,
                    mensaje: 'Código de operario incorrecto.'
                });
            }

            /*
            Segundo código, este sí entregado por la empresa. Es
            obligatorio para todos los operarios: el código del NIT no
            basta por sí solo. Si la cuenta todavía no tiene uno, no se
            permite el ingreso hasta que la empresa (o el administrador)
            lo genere desde el panel.
            */
            if (!usuario.codigo_verificacion_hash) {
                return res.status(403).json({
                    ok: false,
                    requiere: 'codigo_verificacion',
                    rol: 'operario',
                    mensaje:
                        'Tu empresa aún no ha generado tu código de verificación. Pídelo para poder ingresar.'
                });
            }

            const verificacion = String(codigo_verificacion || '').trim();

            if (!verificacion) {
                return res.status(400).json({
                    ok: false,
                    requiere: 'codigo_verificacion',
                    rol: 'operario',
                    mensaje:
                        'Ingresa el código de verificación que te entregó tu empresa.'
                });
            }

            if (!verifyPassword(verificacion, usuario.codigo_verificacion_hash)) {
                await authRepo.registrarIntentoFallido(usuario.id);

                return res.status(401).json({
                    ok: false,
                    mensaje: 'Código de verificación incorrecto.'
                });
            }
        }

        if (usuario.tipo_usuario === 'empresa') {
            const nitEnviado = normalizarNit(nit_empresa);
            const nitGuardado = normalizarNit(
                usuario.empresa_nit || usuario.nit_empresa
            );

            if (!nitEnviado) {
                return res.status(400).json({
                    ok: false,
                    requiere: 'nit_empresa',
                    rol: 'empresa',
                    mensaje: 'Ingresa el NIT de la empresa.'
                });
            }

            if (!nitGuardado) {
                return res.status(403).json({
                    ok: false,
                    rol: 'empresa',
                    mensaje:
                        'Tu cuenta no tiene NIT registrado. Contacta al administrador.'
                });
            }

            /*
            Se comparan solo los dígitos para aceptar tanto
            `900123456-7` como `900.123.456-7`.
            */
            const coincide = compararSeguro(
                soloDigitos(nitEnviado),
                soloDigitos(nitGuardado)
            );

            if (!coincide) {
                await authRepo.registrarIntentoFallido(usuario.id);

                return res.status(401).json({
                    ok: false,
                    mensaje: 'NIT de empresa incorrecto.'
                });
            }
        }

        /*
        El usuario que devuelve `buscarUsuarioLogin` trae columnas
        internas. Solo el frontend recibe los datos públicos: el hash de
        la contraseña, el del código de verificación y los contadores de
        bloqueo se quedan en el servidor.
        */
        delete usuario.codigo_verificacion_hash;
        delete usuario.intentos_fallidos;
        delete usuario.bloqueado_hasta;

        await authRepo.limpiarIntentos(usuario.id);

        const token = crypto.randomBytes(48).toString('hex');

        await authRepo.crearSesion(
            usuario.id,
            hashSessionToken(token),
            SESSION_HOURS
        );

        res.json({
            ok: true,
            mensaje: 'Inicio de sesión correcto.',
            usuario: usuario,
            token: token
        });

    } catch (error) {

        console.error(
            'ERROR EN LOGIN:',
            error
        );

        res.status(500).json({
            ok: false,
            mensaje: 'Error al iniciar sesión.'
        });
    }
});

router.get('/me', requiereSesion, async (req, res) => {
    res.json({
        ok: true,
        usuario: req.usuarioAutenticado
    });
});

router.post('/logout', async (req, res) => {
    const token = obtenerToken(req);

    if (token) {
        await authRepo.eliminarSesion(hashSessionToken(token));
    }

    res.json({
        ok: true,
        mensaje: 'Sesión cerrada correctamente.'
    });
});

module.exports = router;
