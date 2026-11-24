/**
 * @file Composición de las rutas de reportes.
 *
 * @module routes/reportes
 */

const express = require('express');

const router = express.Router();

router.use(require('./reportes/crear'));
router.use(require('./reportes/consultas'));

module.exports = router;
