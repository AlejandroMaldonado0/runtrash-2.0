/**
 * @file Coordinación de peticiones y refrescos en el navegador.
 *
 * Evita que dos acciones disparen la misma carga a la vez:
 *  - `ejecutar` deduplica por clave y devuelve la promesa en curso.
 *  - `cancelar` / `cancelarTodo` abortan peticiones con `AbortController`.
 *  - `enParaleloSeguro` espera varias tareas sin abortar por un fallo.
 *  - `crearRefresco` programa un sondeo que nunca se solapa consigo mismo.
 *
 * Se carga con `defer` antes del script de cada página y expone
 * `window.RunTrashConcurrencia`.
 *
 * @module frontend/shared/concurrencia
 */
(() => {
    "use strict";

    /** Promesas en curso por clave. @type {Map<string, Promise<unknown>>} */
    const enCurso = new Map();

    /** Controladores de cancelación por clave. @type {Map<string, AbortController>} */
    const controladores = new Map();

    /**
     * Ejecuta una tarea y reutiliza la promesa si ya hay una igual en curso.
     *
     * @template T
     * @param {string} clave - Identificador estable de la operación.
     * @param {(signal: AbortSignal) => Promise<T>} tarea - Operación a ejecutar.
     * @param {object} [opciones]
     * @param {boolean} [opciones.cancelarAnterior=false] - Abortar la operación previa.
     * @returns {Promise<T>} Resultado de la tarea.
     */
    function ejecutar(clave, tarea, { cancelarAnterior = false } = {}) {
        const existente = enCurso.get(clave);

        if (existente) {
            if (!cancelarAnterior) return existente;
            cancelar(clave);
        }

        const controlador = new AbortController();
        controladores.set(clave, controlador);

        const promesa = Promise.resolve()
            .then(() => tarea(controlador.signal))
            .finally(() => {
                /*
                Solo se limpia la entrada si sigue siendo esta misma
                promesa: una llamada cancelada y reemplazada no debe
                borrar el registro de la nueva.
                */
                if (enCurso.get(clave) === promesa) enCurso.delete(clave);
                if (controladores.get(clave) === controlador) {
                    controladores.delete(clave);
                }
            });

        enCurso.set(clave, promesa);
        return promesa;
    }

    /**
     * Cancela la operación asociada a una clave.
     *
     * @param {string} clave - Identificador usado en `ejecutar`.
     * @returns {void}
     */
    function cancelar(clave) {
        const controlador = controladores.get(clave);

        if (controlador) controlador.abort();

        controladores.delete(clave);
        enCurso.delete(clave);
    }

    /**
     * Cancela todas las operaciones en curso. Se usa al salir de la página.
     *
     * @returns {void}
     */
    function cancelarTodo() {
        for (const clave of [...controladores.keys()]) cancelar(clave);
    }

    /**
     * Ejecuta tareas en paralelo y devuelve un resultado por tarea.
     *
     * @template T
     * @param {Array<() => Promise<T>>} tareas - Operaciones independientes.
     * @returns {Promise<Array<{ok: true, valor: T}|{ok: false, error: Error}>>}
     */
    async function enParaleloSeguro(tareas) {
        const resultados = await Promise.allSettled(
            tareas.map((tarea) => Promise.resolve().then(tarea))
        );

        return resultados.map((resultado) => (resultado.status === "fulfilled"
            ? { ok: true, valor: resultado.value }
            : {
                ok: false,
                error: resultado.reason instanceof Error
                    ? resultado.reason
                    : new Error(String(resultado.reason))
            }));
    }

    /**
     * Crea un sondeo periódico que no se solapa consigo mismo.
     *
     * Si una ejecución tarda más que el intervalo, la siguiente se
     * omite hasta que la anterior termine.
     *
     * @param {() => Promise<unknown>} tarea - Trabajo a repetir.
     * @param {object} [opciones]
     * @param {number} [opciones.intervalo=30000] - Milisegundos entre ejecuciones.
     * @param {boolean} [opciones.inmediato=false] - Ejecutar al iniciar.
     * @returns {{iniciar: () => void, detener: () => void, ahora: () => Promise<void>, estaActivo: () => boolean}}
     */
    function crearRefresco(tarea, { intervalo = 30000, inmediato = false } = {}) {
        let temporizador = null;
        let ejecutando = false;
        let activo = false;

        /**
         * Ejecuta la tarea si no hay otra ejecución en curso.
         * @returns {Promise<void>}
         */
        async function ahora() {
            if (ejecutando) return;

            ejecutando = true;
            try {
                await tarea();
            } catch (error) {
                /*
                Un sondeo no debe romper la página ni generar promesas
                rechazadas sin manejar. Los errores de cancelación son
                esperados al salir.
                */
                if (error?.name !== "AbortError") {
                    console.error("Error en el refresco periódico:", error);
                }
            } finally {
                ejecutando = false;
            }
        }

        /**
         * Programa la siguiente ejecución.
         * @returns {void}
         */
        function programar() {
            if (!activo) return;

            temporizador = window.setTimeout(async () => {
                await ahora();
                programar();
            }, intervalo);
        }

        return {
            /**
             * Arranca el sondeo. Si ya estaba activo no hace nada.
             *
             * @returns {void}
             */
            iniciar() {
                if (activo) return;
                activo = true;
                if (inmediato) ahora();
                programar();
            },
            /**
             * Detiene el sondeo y cancela el temporizador pendiente.
             *
             * @returns {void}
             */
            detener() {
                activo = false;
                if (temporizador !== null) window.clearTimeout(temporizador);
                temporizador = null;
            },
            ahora,
            /**
             * Indica si el sondeo está activo.
             *
             * @returns {boolean} `true` mientras el temporizador está programado.
             */
            estaActivo() {
                return activo;
            }
        };
    }

    window.RunTrashConcurrencia = Object.freeze({
        ejecutar,
        cancelar,
        cancelarTodo,
        enParaleloSeguro,
        crearRefresco
    });
})();
