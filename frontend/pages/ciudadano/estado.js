/**
 * @file Estado compartido del panel ciudadano.
 *
 * Reúne la base de la API, el coordinador de concurrencia y
 * las colecciones que consumen los demás módulos del panel.
 *
 * @module frontend/pages/ciudadano/estado
 */

const API = window.RunTrashAPI.base;
const Concurrencia = window.RunTrashConcurrencia;
let features;
let reportes = [];
let notificaciones = { notificaciones: [], noLeidas: 0 };
let configuracion = { limite_reportes_diarios: 5 };
let filtroActual = "all";
let usuarioActual = obtenerUsuario("Ciudadano");
let previewUrl = null;
