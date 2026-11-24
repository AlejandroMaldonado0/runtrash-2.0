/**
 * @file Composición de las rutas de administración.
 *
 * @module routes/admin
 */

const express = require('express');

const router = express.Router();

router.use(require('./admin/resumen'));
router.use(require('./admin/usuarios'));
router.use(require('./admin/configuracion'));

module.exports = router;
