/**
 * @file Reglas de negocio de operarios.
 *
 * Centraliza la rotación del código de verificación que la empresa
 * entrega al operario, para que tanto la empresa como el administrador
 * apliquen el mismo procedimiento.
 *
 * @module services/operarios
 */

const adminRepo = require('../repositories/admin');
const { notificarUsuarios } = require('../lib/notificaciones');
const {
    hashPassword,
    generarCodigoVerificacion
} = require('../lib/security');

/**
 * Genera y guarda un código de verificación nuevo para un operario.
 *
 * El código en texto plano solo se devuelve una vez, para que la
 * empresa se lo entregue al operario. En la base queda únicamente el
 * hash scrypt. Al rotarlo se cierran las sesiones abiertas del operario.
 *
 * @param {{id: number, nombre?: string}} operario - Operario destino.
 * @returns {Promise<string>} Código de seis dígitos.
 */
async function rotarCodigoVerificacion(operario) {
    const codigo = generarCodigoVerificacion();

    await adminRepo.actualizarCodigoVerificacion(
        operario.id,
        hashPassword(codigo)
    );

    await adminRepo.eliminarSesiones(operario.id);

    await notificarUsuarios([operario.id], {
        tipo: 'seguridad',
        titulo: 'Nuevo código de verificación',
        mensaje:
            'Tu empresa generó un nuevo código de verificación. ' +
            'Pídelo a tu empresa para volver a ingresar.',
        referenciaTipo: 'usuario',
        referenciaId: operario.id
    });

    return codigo;
}

module.exports = {
    rotarCodigoVerificacion
};
