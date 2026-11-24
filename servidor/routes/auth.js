/**
 * @file Composición de las rutas de autenticación.
 *
 * @module routes/auth
 */

const express = require('express');

const router = express.Router();

router.use(require('./auth/registro'));
router.use(require('./auth/sesion'));
router.use(require('./auth/oauth'));
router.use(require('./auth/password'));

module.exports = router;
