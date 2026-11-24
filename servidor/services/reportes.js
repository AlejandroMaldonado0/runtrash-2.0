/**
 * @file Lógica de negocio de los reportes.
 *
 * Las rutas validan la petición y responden; este módulo decide qué
 * debe pasar con los datos. Cada operación que cambia varias filas se
 * ejecuta en una transacción para que dos peticiones concurrentes no
 * dejen el sistema en un estado inconsistente.
 *
 * @module services/reportes
 */

const { conTransaccion } = require('../lib/db');
const reportesRepo = require('../repositories/reportes');
const empresaRepo = require('../repositories/empresa');
const { ErrorServicio } = require('./errores');

/**
 * Crea un reporte ciudadano respetando el límite diario y asigna
 * automáticamente un operario de la localidad si hay uno disponible.
 *
 * La fila del usuario se bloquea al inicio de la transacción. Eso
 * convierte la comprobación del límite y la inserción en una operación
 * atómica: dos envíos simultáneos del mismo ciudadano no pueden leer el
 * mismo conteo y superar el máximo.
 *
 * @param {object} datos - Datos ya validados por la ruta.
 * @param {number} datos.usuarioId - Ciudadano que reporta.
 * @param {string} datos.tipo - Tipo de residuo.
 * @param {string} datos.descripcion - Descripción del reporte.
 * @param {string} datos.ubicacion - Dirección o referencia.
 * @param {string} datos.localidad - Localidad seleccionada.
 * @param {number|null} datos.latitud - Latitud opcional.
 * @param {number|null} datos.longitud - Longitud opcional.
 * @param {string|null} datos.imagenUrl - Ruta pública de la foto.
 * @returns {Promise<{reporte: object, operarioAsignado: object|null}>} Resultado.
 * @throws {ErrorServicio} Si el usuario alcanzó el límite diario.
 */
async function crearReporteCiudadano(datos) {
    return conTransaccion(async (cliente) => {
        /*
        El bloqueo del usuario debe ser la primera escritura de la
        transacción para que todas las peticiones del mismo ciudadano
        hagan fila aquí y no más adelante.
        */
        await reportesRepo.bloquearUsuario(datos.usuarioId, cliente);

        /*
        Estas dos consultas comparten el mismo cliente, así que se
        ejecutan en serie: un PoolClient de PostgreSQL no admite dos
        consultas simultáneas.
        */
        const limite = await reportesRepo.limiteReportesDiarios(cliente);
        const reportesHoy = await reportesRepo.contarReportesHoy(
            datos.usuarioId,
            cliente
        );

        if (reportesHoy >= limite) {
            throw new ErrorServicio(
                `Alcanzaste el límite de ${limite} reportes diarios.`,
                429,
                'LIMITE_DIARIO'
            );
        }

        const reporteCreado = await reportesRepo.crearReporte(datos, cliente);

        /*
        El operario se busca dentro de la misma transacción y con
        SKIP LOCKED: si otro reporte se está asignando al mismo tiempo,
        se elige al siguiente operario disponible.
        */
        const operarioAsignado = await reportesRepo.buscarOperarioSector(
            String(datos.localidad).trim(),
            cliente,
            true
        );

        if (!operarioAsignado) {
            return { reporte: reporteCreado, operarioAsignado: null };
        }

        const reporte = await reportesRepo.asignarOperario(
            reporteCreado.id,
            operarioAsignado.id,
            cliente
        );

        return { reporte, operarioAsignado };
    });
}

/**
 * Cambia el estado de un reporte asignado a un operario.
 *
 * El `UPDATE` filtra por operario y bloquea la fila afectada, por lo
 * que dos cambios simultáneos sobre el mismo reporte se serializan y
 * solo el último estado queda guardado.
 *
 * @param {object} datos
 * @param {number} datos.reporteId - Reporte a actualizar.
 * @param {number} datos.operarioId - Operario autenticado.
 * @param {string} datos.estado - `en proceso` o `completado`.
 * @returns {Promise<object>} Reporte actualizado.
 * @throws {ErrorServicio} Si el estado no es válido o el reporte no pertenece al operario.
 */
async function cambiarEstadoReporte({ reporteId, operarioId, estado }) {
    if (!['en proceso', 'completado'].includes(estado)) {
        throw new ErrorServicio('Estado no válido.', 400, 'ESTADO_INVALIDO');
    }

    return conTransaccion(async (cliente) => {
        const actualizado = await empresaRepo.actualizarEstado(
            reporteId,
            operarioId,
            estado,
            cliente
        );

        if (!actualizado) {
            throw new ErrorServicio(
                'El reporte no existe o no está asignado a este operario.',
                404,
                'NO_ASIGNADO'
            );
        }

        return actualizado;
    });
}

/**
 * Asigna manualmente un reporte a un operario de la empresa.
 *
 * Bloquea el reporte antes de comprobar si ya tiene operario. Sin ese
 * bloqueo dos responsables podrían ver el mismo reporte libre y el
 * segundo `UPDATE` fallaría (o reasignaría sin querer). Cuando quien
 * asigna es una empresa, el reporte debe pertenecer a su ámbito y el
 * operario debe ser suyo.
 *
 * @param {object} datos
 * @param {number} datos.reporteId - Reporte a asignar.
 * @param {number} datos.operarioId - Operario elegido.
 * @param {number|null} datos.empresaId - Empresa del usuario autenticado.
 * @param {boolean} [datos.esAdmin=false] - El administrador puede ver todo.
 * @returns {Promise<{reporte: object, operario: object}>} Asignación.
 * @throws {ErrorServicio} Si el reporte u operario no existen o ya está asignado.
 */
async function asignarReporte({
    reporteId,
    operarioId,
    empresaId,
    esAdmin = false
}) {
    return conTransaccion(async (cliente) => {
        const reporte = await empresaRepo.buscarReporte(
            reporteId,
            cliente,
            true
        );

        if (!reporte) {
            throw new ErrorServicio(
                'Reporte no encontrado.',
                404,
                'REPORTE_NO_ENCONTRADO'
            );
        }

        if (!esAdmin) {
            if (!empresaId) {
                throw new ErrorServicio(
                    'Tu cuenta no está asociada a una empresa.',
                    403,
                    'SIN_EMPRESA'
                );
            }

            const visible = await empresaRepo.empresaPuedeVerReporte(
                reporteId,
                empresaId,
                cliente
            );

            if (!visible) {
                throw new ErrorServicio(
                    'Reporte no encontrado.',
                    404,
                    'REPORTE_NO_ENCONTRADO'
                );
            }
        }

        if (reporte.operario_id) {
            throw new ErrorServicio(
                'El reporte ya tiene un operario asignado.',
                409,
                'YA_ASIGNADO'
            );
        }

        const operario = await empresaRepo.buscarOperarioAsignable(
            operarioId,
            empresaId,
            cliente
        );

        if (!operario) {
            throw new ErrorServicio(
                'El operario no existe.',
                404,
                'OPERARIO_NO_ENCONTRADO'
            );
        }

        const asignado = await empresaRepo.asignarReporte(
            reporteId,
            operarioId,
            cliente
        );

        if (!asignado) {
            throw new ErrorServicio(
                'El reporte ya tiene un operario asignado.',
                409,
                'YA_ASIGNADO'
            );
        }

        return { reporte: asignado, operario };
    });
}

/**
 * Asigna un reporte libre al operario con menos carga de su localidad.
 *
 * @param {object} datos
 * @param {number} datos.reporteId - Reporte a asignar.
 * @param {number|null} datos.empresaId - Empresa del usuario autenticado.
 * @param {boolean} [datos.esAdmin=false] - El administrador puede ver todo.
 * @returns {Promise<{reporte: object, operario: object}>} Asignación.
 * @throws {ErrorServicio} Si no hay reporte, ya está asignado o no hay operario.
 */
async function asignarAutomaticamente({
    reporteId,
    empresaId,
    esAdmin = false
}) {
    return conTransaccion(async (cliente) => {
        const reporte = await empresaRepo.buscarReporte(
            reporteId,
            cliente,
            true
        );

        if (!reporte) {
            throw new ErrorServicio(
                'Reporte no encontrado.',
                404,
                'REPORTE_NO_ENCONTRADO'
            );
        }

        if (!esAdmin) {
            if (!empresaId) {
                throw new ErrorServicio(
                    'Tu cuenta no está asociada a una empresa.',
                    403,
                    'SIN_EMPRESA'
                );
            }

            const visible = await empresaRepo.empresaPuedeVerReporte(
                reporteId,
                empresaId,
                cliente
            );

            if (!visible) {
                throw new ErrorServicio(
                    'Reporte no encontrado.',
                    404,
                    'REPORTE_NO_ENCONTRADO'
                );
            }
        }

        if (reporte.operario_id) {
            throw new ErrorServicio(
                'El reporte ya tiene un operario asignado.',
                409,
                'YA_ASIGNADO'
            );
        }

        const operario = await empresaRepo.buscarOperadorPorLocalidad(
            reporte.localidad,
            empresaId,
            cliente,
            true
        );

        if (!operario) {
            throw new ErrorServicio(
                `No hay un operario activo para ${reporte.localidad || 'la localidad seleccionada'}.`,
                409,
                'SIN_OPERARIO'
            );
        }

        const asignado = await empresaRepo.asignarAutomaticamente(
            reporteId,
            operario.id,
            cliente
        );

        if (!asignado) {
            throw new ErrorServicio(
                'El reporte ya tiene un operario asignado.',
                409,
                'YA_ASIGNADO'
            );
        }

        return { reporte: asignado, operario };
    });
}

module.exports = {
    crearReporteCiudadano,
    cambiarEstadoReporte,
    asignarReporte,
    asignarAutomaticamente
};
