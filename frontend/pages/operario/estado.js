/**
 * @file Estado compartido del panel de operario.
 *
 * Reúne la base de la API, el coordinador de concurrencia y las
 * colecciones que consumen los demás módulos del panel.
 *
 * @module frontend/pages/operario/estado
 */

const API = window.RunTrashAPI.base;
const Concurrencia = window.RunTrashConcurrencia;
let features;
let reportes = [];
let notificaciones = { notificaciones: [], noLeidas: 0 };
let configuracion = { limite_ruta: 15 };
let filtroActual = "all";
let usuarioActual = obtenerUsuario("Operario");
