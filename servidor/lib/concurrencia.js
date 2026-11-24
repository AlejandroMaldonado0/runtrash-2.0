/**
 * @file Utilidades de concurrencia para el backend.
 *
 * Centraliza los patrones que se repiten al ejecutar varias tareas
 * asíncronas: esperar todo en paralelo, tolerar fallos parciales y
 * limitar cuántas operaciones corren a la vez (por ejemplo, notificar
 * a muchos usuarios sin abrir cientos de conexiones).
 *
 * @module lib/concurrencia
 */

/**
 * Ejecuta todas las tareas en paralelo y falla si alguna falla.
 *
 * @template T
 * @param {Array<() => Promise<T>>} tareas - Funciones que devuelven promesas.
 * @returns {Promise<T[]>} Resultados en el mismo orden de entrada.
 */
async function enParalelo(tareas) {
    return Promise.all(tareas.map((tarea) => tarea()));
}

/**
 * Ejecuta todas las tareas en paralelo sin abortar por un fallo.
 *
 * Devuelve un resultado por tarea para que el llamador decida qué hacer
 * con los errores parciales (por ejemplo, notificaciones que no salieron).
 *
 * @template T
 * @param {Array<() => Promise<T>>} tareas - Funciones que devuelven promesas.
 * @returns {Promise<Array<{ok: true, valor: T}|{ok: false, error: Error}>>} Resultados.
 */
async function enParaleloSeguro(tareas) {
    const resultados = await Promise.allSettled(tareas.map((tarea) => tarea()));

    return resultados.map((resultado) => (resultado.status === 'fulfilled'
        ? { ok: true, valor: resultado.value }
        : { ok: false, error: resultado.reason instanceof Error ? resultado.reason : new Error(String(resultado.reason)) }));
}

/**
 * Procesa una lista con un máximo de tareas simultáneas.
 *
 * Se usa un pool de trabajadores: cada uno toma el siguiente índice
 * disponible hasta agotar la lista. Mantiene el orden de los resultados.
 *
 * @template T, R
 * @param {T[]} elementos - Elementos a procesar.
 * @param {number} limite - Máximo de tareas simultáneas (mínimo 1).
 * @param {(elemento: T, indice: number) => Promise<R>} tarea - Operación por elemento.
 * @returns {Promise<R[]>} Resultados en el orden original.
 */
async function mapaConcurrente(elementos, limite, tarea) {
    const lista = Array.from(elementos || []);
    const resultados = new Array(lista.length);
    const concurrencia = Math.max(1, Math.min(Number(limite) || 1, lista.length || 1));
    let siguiente = 0;

    /**
     * Toma elementos de la cola hasta que no queden.
     * @returns {Promise<void>}
     */
    async function trabajador() {
        while (siguiente < lista.length) {
            const indice = siguiente;
            siguiente += 1;
            resultados[indice] = await tarea(lista[indice], indice);
        }
    }

    await Promise.all(Array.from({ length: concurrencia }, () => trabajador()));
    return resultados;
}

module.exports = {
    enParalelo,
    enParaleloSeguro,
    mapaConcurrente
};
