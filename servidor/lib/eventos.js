/**
 * @file Canal de eventos en tiempo real (Server-Sent Events).
 *
 * Mantiene los clientes conectados a `/api/eventos` y permite difundir
 * cambios solo a quienes deben verlos. Cada evento declara sus
 * destinatarios por usuario, rol o empresa; por defecto se entrega a
 * administración, nunca a todos los conectados.
 *
 * @module lib/eventos
 */

/**
 * Clientes SSE conectados y su usuario autenticado.
 * @type {Map<import('express').Response, object>}
 */
const clientesEventos = new Map();

/**
 * Registra una respuesta como cliente SSE.
 *
 * @param {import('express').Response} res - Respuesta express.
 * @param {object} [usuario] - Usuario autenticado de la conexión.
 * @returns {void}
 */
function agregarCliente(res, usuario = null) {
    clientesEventos.set(res, usuario);
}

/**
 * Elimina un cliente SSE (al cerrarse la conexión).
 *
 * @param {import('express').Response} res - Respuesta express.
 * @returns {void}
 */
function quitarCliente(res) {
    clientesEventos.delete(res);
}

/**
 * Indica si un cliente debe recibir un evento.
 *
 * @param {object|null} usuario - Usuario del cliente.
 * @param {object} opciones - Filtros del evento.
 * @returns {boolean} `true` si corresponde enviarlo.
 */
function debeRecibir(usuario, { usuarios, roles, empresaId, global }) {
    if (global) return true;
    if (!usuario) return false;

    if (usuarios.includes(usuario.id)) return true;

    /*
    Un evento para el rol `empresa` sin empresa concreta se rechaza
    para no filtrar datos entre organizaciones. Los demás roles no
    tienen ese problema porque no están aislados por empresa.
    */
    if (roles.includes(usuario.tipo_usuario)) {
        if (usuario.tipo_usuario === 'empresa') {
            return empresaId !== null && usuario.empresa_id === empresaId;
        }
        return true;
    }

    return empresaId !== null && usuario.empresa_id === empresaId;
}

/**
 * Difunde un evento a los clientes destinatarios.
 *
 * @param {string} tipo - Nombre del evento (p. ej. `reporte_creado`).
 * @param {Record<string, unknown>} [datos] - Carga adicional del evento.
 * @param {object} [opciones] - Destinatarios.
 * @param {number[]} [opciones.usuarios=[]] - Ids de usuarios concretos.
 * @param {string[]} [opciones.roles=['admin']] - Roles destinatarios.
 * @param {number|null} [opciones.empresaId=null] - Empresa destinataria.
 * @param {boolean} [opciones.global=false] - Enviar a todos (solo para
 * eventos realmente públicos; no usar con datos personales).
 * @returns {void}
 */
function emitirEvento(tipo, datos = {}, opciones = {}) {
    const filtros = {
        usuarios: opciones.usuarios || [],
        roles: opciones.roles || ['admin'],
        empresaId: opciones.empresaId ?? null,
        global: opciones.global === true
    };

    const mensaje = `data: ${JSON.stringify({
        tipo,
        ...datos,
        fecha: new Date().toISOString()
    })}\n\n`;

    for (const [cliente, usuario] of clientesEventos) {
        if (!debeRecibir(usuario, filtros)) continue;

        try {
            cliente.write(mensaje);
        } catch (error) {
            console.error('Error escribiendo evento SSE:', error);
            clientesEventos.delete(cliente);
        }
    }
}

/** Número de clientes SSE conectados (útil para diagnóstico). */
function totalClientes() {
    return clientesEventos.size;
}

module.exports = {
    agregarCliente,
    quitarCliente,
    emitirEvento,
    totalClientes
};
