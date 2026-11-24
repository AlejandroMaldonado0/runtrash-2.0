/**
 * @file Cambio y recuperación de contraseñas.
 *
 * @module routes/auth/password
 */

const express = require('express');
const crypto = require('crypto');
const authRepo = require('../../repositories/auth');
const {
    hashPassword,
    verifyPassword,
    validarPassword
} = require('../../lib/security');
const { authLimiter } = require('../../lib/limiters');
const { requiereSesion } = require('../../lib/auth');
const { emitirEvento } = require('../../lib/eventos');

const router = express.Router();

router.post('/password/cambiar', requiereSesion, async (req, res) => {
    try {
        const currentPassword = String(req.body.current_password || '');
        const newPassword = String(req.body.new_password || '');
        const validacionPassword = validarPassword(newPassword);

        if (!validacionPassword.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
            });
        }

        const currentHash = await authRepo.obtenerPassword(
            req.usuarioAutenticado.id
        );
        if (!verifyPassword(currentPassword, currentHash)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La contraseña actual no es correcta.'
            });
        }

        await authRepo.actualizarPassword(
            req.usuarioAutenticado.id,
            hashPassword(newPassword)
        );
        await authRepo.eliminarSesiones(req.usuarioAutenticado.id);

        res.json({
            ok: true,
            mensaje: 'Contraseña actualizada. Inicia sesión nuevamente.'
        });
    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo cambiar la contraseña.'
        });
    }
});

/*
=========================================================
RECUPERACIÓN DE CONTRASEÑA
=========================================================
*/

const RECUPERACION_MINUTOS = Number(process.env.RECUPERACION_MINUTOS || 20);
const RECUPERACION_INTENTOS = Number(process.env.RECUPERACION_INTENTOS || 5);

/*
En desarrollo el codigo se devuelve en la respuesta para poder
completar el flujo sin servidor de correo. En produccion NUNCA se
expone por defecto: cualquiera que conozca un correo podria tomar la
cuenta. Solo se activa si EXPOSER_CODIGO_RECUPERACION=true de forma
explicita y consciente.
*/
const EN_PRODUCCION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const EXPONER_CODIGO = String(
    process.env.EXPOSER_CODIGO_RECUPERACION ?? (EN_PRODUCCION ? 'false' : 'true')
).toLowerCase() !== 'false';

if (EN_PRODUCCION && !EXPONER_CODIGO) {
    console.warn(
        'Recuperación de contraseña: el envío de correo no está implementado. '
        + 'Configura un proveedor de correo o define '
        + 'EXPOSER_CODIGO_RECUPERACION=true solo en un entorno controlado.'
    );
}

/**
 * Genera un código numérico de seis dígitos para recuperación.
 *
 * @returns {string} Código con ceros a la izquierda.
 */
function generarCodigoRecuperacion() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Valida el formato de un correo electrónico.
 *
 * @param {string} correo - Correo ya normalizado.
 * @returns {boolean} `true` si tiene forma válida.
 */
function correoValido(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

router.post('/password/recuperar/solicitar', authLimiter, async (req, res) => {
    try {
        const correo = String(req.body.correo || '').trim().toLowerCase();

        if (!correoValido(correo)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Ingresa un correo válido.'
            });
        }

        const cuenta = await authRepo.buscarUsuarioRecuperacion(correo);

        const mensajeGenerico = 'Si el correo está registrado, enviamos un código de recuperación.';

        if (!cuenta) {
            return res.json({ ok: true, mensaje: mensajeGenerico });
        }

        if (!cuenta.activo) {
            return res.json({ ok: true, mensaje: mensajeGenerico });
        }

        await authRepo.invalidarRecuperaciones(cuenta.id);

        const codigo = generarCodigoRecuperacion();

        await authRepo.crearRecuperacion(
            cuenta.id,
            hashPassword(codigo),
            RECUPERACION_MINUTOS
        );

        /*
        En produccion no se escribe el codigo en los logs: los logs
        pueden acabar en un servicio externo y el codigo permite
        tomar la cuenta.
        */
        if (!EN_PRODUCCION) {
            console.log(`Código de recuperación para ${cuenta.correo}: ${codigo}`);
        }

        res.json({
            ok: true,
            mensaje: mensajeGenerico,
            ...(EXPONER_CODIGO ? { codigo_demo: codigo } : {})
        });
    } catch (error) {
        console.error('Error solicitando recuperación:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo iniciar la recuperación.'
        });
    }
});

/**
 * Busca y valida un código de recuperación vigente.
 *
 * @param {string} correo - Correo normalizado.
 * @param {string} codigo - Código ingresado por el usuario.
 * @returns {Promise<{ok: true, registro: object}|{ok: false, motivo: string}>} Resultado.
 */
async function validarCodigoRecuperacion(correo, codigo) {
    const registro = await authRepo.buscarRecuperacion(correo);

    if (!registro) return { ok: false, motivo: 'invalido' };

    if (new Date(registro.expira).getTime() < Date.now()) {
        return { ok: false, motivo: 'expirado' };
    }

    if (registro.intentos >= RECUPERACION_INTENTOS) {
        return { ok: false, motivo: 'bloqueado' };
    }

    if (!verifyPassword(codigo, registro.codigo_hash)) {
        await authRepo.incrementarIntentos(registro.id);
        return {
            ok: false,
            motivo: 'incorrecto',
            intentosRestantes: Math.max(0, RECUPERACION_INTENTOS - registro.intentos - 1)
        };
    }

    return { ok: true, registro };
}

router.post('/password/recuperar/verificar', authLimiter, async (req, res) => {
    try {
        const correo = String(req.body.correo || '').trim().toLowerCase();
        const codigo = String(req.body.codigo || '').trim();

        if (!correoValido(correo) || !/^\d{6}$/.test(codigo)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Ingresa tu correo y el código de 6 dígitos.'
            });
        }

        const validacion = await validarCodigoRecuperacion(correo, codigo);

        if (!validacion.ok) {
            const mensajes = {
                invalido: 'El código no es válido o ya fue usado.',
                expirado: 'El código expiró. Solicita uno nuevo.',
                bloqueado: 'Demasiados intentos. Solicita un código nuevo.',
                incorrecto: 'El código no coincide.'
            };

            return res.status(400).json({
                ok: false,
                motivo: validacion.motivo,
                mensaje: mensajes[validacion.motivo] || 'No se pudo verificar el código.',
                ...(validacion.intentosRestantes !== undefined
                    ? { intentos_restantes: validacion.intentosRestantes }
                    : {})
            });
        }

        res.json({
            ok: true,
            mensaje: 'Código verificado. Define tu nueva contraseña.'
        });
    } catch (error) {
        console.error('Error verificando código:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo verificar el código.'
        });
    }
});

router.post('/password/recuperar/restablecer', authLimiter, async (req, res) => {
    try {
        const correo = String(req.body.correo || '').trim().toLowerCase();
        const codigo = String(req.body.codigo || '').trim();
        const nuevaPassword = String(req.body.password || '');

        if (!correoValido(correo) || !/^\d{6}$/.test(codigo)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Solicita un código de recuperación válido.'
            });
        }

        const validacionPassword = validarPassword(nuevaPassword);

        if (!validacionPassword.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
            });
        }

        const validacion = await validarCodigoRecuperacion(correo, codigo);

        if (!validacion.ok) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El código no es válido, expiró o superaste los intentos.'
            });
        }

        const cuenta = await authRepo.buscarIdPorCorreo(correo);

        if (!cuenta) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El código no es válido, expiró o superaste los intentos.'
            });
        }

        const usuarioId = cuenta.id;

        await authRepo.actualizarPassword(
            usuarioId,
            hashPassword(nuevaPassword)
        );

        await authRepo.marcarRecuperacionUsada(validacion.registro.id);
        await authRepo.eliminarSesiones(usuarioId);

        emitirEvento('password_restablecida', { usuario_id: usuarioId }, {
            usuarios: [usuarioId]
        });

        res.json({
            ok: true,
            mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.'
        });
    } catch (error) {
        console.error('Error restableciendo contraseña:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo actualizar la contraseña.'
        });
    }
});

module.exports = router;
