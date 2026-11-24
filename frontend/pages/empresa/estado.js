/**
 * @file Estado compartido del panel de empresa.
 *
 * Reúne la base de la API, el coordinador de concurrencia y
 * las colecciones que consumen los demás módulos del panel.
 *
 * @module frontend/pages/empresa/estado
 */

const API = window.RunTrashAPI.base;
const Concurrencia = window.RunTrashConcurrencia;
let features;
let reportes = [];
let operarios = [];
let notificaciones = { notificaciones: [], noLeidas: 0 };
let filtroActual = "all";
let mapaFiltro = "all";
let mapaPrincipal = null;
let capaMarcadores = null;
let capaZonas = null;
let capaCalor = null;
let usuarioActual = obtenerUsuario("Empresa");
