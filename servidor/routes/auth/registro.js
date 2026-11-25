/**
 * @file Registro público de ciudadanos.
 *
 * Solo los ciudadanos pueden crear su cuenta desde la web. Las cuentas
 * de empresa, operario, administración y entes de control las crea un
 * administrador (o una empresa, para sus propios operarios) después de
 * verificar el NIT y la identidad. Así nadie puede autoasignarse un rol
 * privilegiado ni reclamar el NIT de otra organización.
 *
 * @module routes/auth/registro
 */

const express = require('express');
const { pool } = require('../../lib/db');
const authRepo = require('../../repositories/auth');
const { hashPassword, validarPassword } = require('../../lib/security');
const { authLimiter } = require('../../lib/limiters');

const router = express.Router();

/** Roles que la ciudadanía puede crear libremente. */
const TIPOS_PUBLICOS = new Set(['ciudadano']);

router.post('/registro', authLimiter, async (req, res) => {

    try {

        const {
            nombre,
            correo,
            password,
            tipo_usuario,
            fecha_nacimiento
        } = req.body;

        const tipoSolicitado = String(tipo_usuario || 'ciudadano').trim();

        if (!TIPOS_PUBLICOS.has(tipoSolicitado)) {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'Las cuentas de empresa y operario las crea un administrador.'
            });
        }

        if (
            !String(nombre || '').trim() ||
            !correo ||
            !password
        ) {

            return res.status(400).json({
                ok: false,
                mensaje: 'Faltan datos obligatorios.'
            });
        }

        const fechaNacimientoSolicitada = String(fecha_nacimiento || '').trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimientoSolicitada)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La fecha de nacimiento es obligatoria y no es válida.'
            });
        }

        const validacionPassword = validarPassword(password);

        if (!validacionPassword.ok) {

            return res.status(400).json({
                ok: false,
                mensaje: validacionPassword.mensaje
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

        const existeCorreo = await authRepo.buscarPorCorreo(correoNormalizado);

        if (existeCorreo) {

            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const usuario = await authRepo.crearUsuario(client, {
                nombre: String(nombre).trim(),
                correo: correoNormalizado,
                passwordHash: hashPassword(password),
                tipoUsuario: 'ciudadano',
                codigoOperario: null,
                zonaAsignada: null,
                empresaId: null,
                nitEmpresa: null,
                fechaNacimiento: fecha_nacimiento
            });

            await client.query('COMMIT');

            res.status(201).json({
                ok: true,
                mensaje: 'Usuario registrado correctamente.',
                usuario
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {

        console.error(
            'ERROR REGISTRANDO USUARIO:',
            error
        );

        if (error.code === '23505') {
            return res.status(409).json({
                ok: false,
                mensaje: 'El correo ya está registrado.'
            });
        }

        res.status(500).json({
            ok: false,
            mensaje: 'Error al registrar usuario.'
        });
    }
});

module.exports = router;
