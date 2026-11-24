/**
 * @file Errores de la capa de lógica de negocio.
 *
 * Los servicios no conocen HTTP: describen qué salió mal con un código
 * de estado sugerido. Las rutas traducen ese error a una respuesta JSON,
 * de modo que la regla de negocio vive en un solo lugar.
 *
 * @module services/errores
 */

/**
 * Error esperado de una operación de negocio.
 *
 * @extends Error
 */
class ErrorServicio extends Error {
    /**
     * @param {string} mensaje - Mensaje apto para el usuario.
     * @param {number} [estado=400] - Código HTTP sugerido.
     * @param {string|null} [codigo=null] - Identificador interno del caso.
     */
    constructor(mensaje, estado = 400, codigo = null) {
        super(mensaje);
        this.name = 'ErrorServicio';
        this.estado = estado;
        this.codigo = codigo;
    }
}

/**
 * Comprueba si un error proviene de la capa de servicios.
 *
 * @param {unknown} error - Valor capturado en un `catch`.
 * @returns {error is ErrorServicio} `true` si es un error de negocio.
 */
function esErrorServicio(error) {
    return error instanceof ErrorServicio;
}

module.exports = {
    ErrorServicio,
    esErrorServicio
};
