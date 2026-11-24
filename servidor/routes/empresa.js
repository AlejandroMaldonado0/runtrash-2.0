/**
 * @file Composición de las rutas de empresa y operarios.
 *
 * @module routes/empresa
 */

const express = require('express');

const router = express.Router();

router.use(require('./empresa/operarios'));
router.use(require('./empresa/asignaciones'));
router.use(require('./empresa/estado'));

module.exports = router;
