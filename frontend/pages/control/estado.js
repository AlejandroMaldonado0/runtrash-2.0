/**
 * @file Estado compartido del panel de control.
 *
 * Reúne la base de la API, el coordinador de concurrencia, los
 * catálogos de entes y las colecciones del panel.
 *
 * @module frontend/pages/control/estado
 */

const API = window.RunTrashAPI.base;
const Concurrencia = window.RunTrashConcurrencia;

const ROLES_CONTROL = ["distrito", "policia", "sspd", "admin"];
const NOMBRES_ENTE = {
    distrito: "Distrito",
    policia: "Policía",
    sspd: "Superintendencia de Servicios Públicos",
    admin: "Administrador"
};
const NOMBRES_TIPO_SEGUIMIENTO = {
    observacion: "Observación",
    requerimiento: "Requerimiento",
    visita: "Visita",
    cierre: "Cierre"
};

let features;
let token = localStorage.getItem("runtrash_token");
let usuarioActual = obtenerUsuario("Ente de control");
let reportes = [];
let resumen = {};
let notificaciones = { notificaciones: [], noLeidas: 0 };
let controlEvents = null;
let reporteAbierto = null;
