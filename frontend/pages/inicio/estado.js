/**
 * @file Estado compartido de la página de inicio.
 *
 * Los scripts clásicos cargados con `defer` comparten el entorno global,
 * así que las variables declaradas aquí quedan disponibles para los
 * módulos de login, registro y recuperación sin duplicarlas.
 *
 * @module frontend/pages/inicio/estado
 */

/** Base de la API resuelta por `frontend/shared/api.js`. */
const API = window.RunTrashAPI.base;

/**
 * Tipo de usuario seleccionado en el formulario de login.
 * @type {"ciudadano"|"operario"|"empresa"|"distrito"|"policia"|"sspd"}
 */
let tipoSeleccionado = "ciudadano";

/**
 * Tipo de usuario seleccionado en el formulario de registro. El
 * autorregistro público solo permite ciudadanos.
 * @type {"ciudadano"}
 */
let tipoRegistro = "ciudadano";

/**
 * Estado del asistente de recuperación de contraseña.
 * @type {{correo: string, paso: 1|2|3}}
 */
const recuperacionEstado = {
    correo: "",
    paso: 1
};
