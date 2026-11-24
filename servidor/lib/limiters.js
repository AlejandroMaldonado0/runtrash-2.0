/**
 * @file Limitadores de peticiones (rate limiting).
 *
 * Se separan del punto de entrada para poder reutilizarlos en los
 * routers modulares sin duplicar configuración.
 *
 * @module lib/limiters
 */

const { rateLimit } = require('express-rate-limit');

/** Límite general para toda la API. */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-8',
    legacyHeaders: false
});

/** Límite estricto para login, registro y recuperación de clave. */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        ok: false,
        mensaje: 'Demasiados intentos. Espera unos minutos e intenta nuevamente.'
    }
});

module.exports = {
    generalLimiter,
    authLimiter
};
