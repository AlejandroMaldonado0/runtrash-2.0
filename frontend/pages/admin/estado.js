/**
 * @file Estado compartido del panel administrador.
 *
 * Reúne la base de la API, el coordinador de concurrencia, la
 * sesión y las colecciones que consumen los demás módulos.
 *
 * @module frontend/pages/admin/estado
 */

const API = window.RunTrashAPI.base;
const Concurrencia = window.RunTrashConcurrencia;
let features;
let token = localStorage.getItem("runtrash_token");
let usuarioActual = obtenerUsuario("Administrador");
let resumen = {};
let usuarios = [];
let configuracion = {};
let editingUserId = null;
let adminEvents = null;
let notificaciones = { notificaciones: [], noLeidas: 0 };
