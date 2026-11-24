/**
 * @file Carga de datos del panel ciudadano.
 *
 * Descarga reportes y notificaciones, y coordina las peticiones
 * para evitar cargas superpuestas.
 *
 * @module frontend/pages/ciudadano/datos
 */

/**
 * Descarga los reportes del ciudadano y avisa de los cambios de estado.
 *
 * @param {boolean} [silencioso=false] - No mostrar errores ni notificaciones.
 * @param {boolean} [notificar=true] - Enviar notificación nativa ante cambios.
 * @param {AbortSignal} [signal] - Señal para cancelar la petición al salir.
 * @returns {Promise<void>}
 */
async function cargarReportesInterno(silencioso = false, notificar = true, signal = undefined) {
    if (!exigirUsuario(!silencioso)) return;

    try {
        const response = await features.apiFetch(
            `${API}/api/reportes/usuario/${usuarioActual.id}`,
            signal ? { signal } : undefined
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudieron cargar los reportes.");

        const anteriores = new Map(reportes.map((report) => [report.id, report.estado]));
        const esCargaInicial = reportes.length === 0 && !silencioso;
        reportes = data.reportes || [];

        if (notificar && !esCargaInicial && reportes.length) {
            const novedades = reportes.filter((report) => {
                const estadoAnterior = anteriores.get(report.id);
                return estadoAnterior && estadoAnterior !== report.estado;
            });

            if (novedades.length) {
                features.notify(
                    "Actualización de RunTrash",
                    novedades.length === 1
                        ? `Tu reporte ${novedades[0].tipo} ahora está ${textoEstado(novedades[0].estado).toLowerCase()}.`
                        : `${novedades.length} reportes cambiaron de estado.`
                );
            }
        }

        renderReportes();
    } catch (error) {
        if (error?.name === "AbortError") return;
        console.error(error);
        if (!silencioso) mostrarToast(error.message || "No se pudieron cargar los reportes.");
    }
}

/**
 * Carga los reportes a través del coordinador de peticiones.
 *
 * Si ya hay una carga en curso, devuelve la misma promesa en lugar de
 * abrir otra petición.
 *
 * @returns {Promise<void>}
 */
function cargarReportes(silencioso = false, notificar = true) {
    return Concurrencia.ejecutar(
        "ciudadano:reportes",
        (signal) => cargarReportesInterno(silencioso, notificar, signal)
    );
}

/**
 * Pinta la lista de reportes según el filtro activo y actualiza los
 * indicadores.
 *
 * @returns {void}

/**
 * Descarga las notificaciones con el helper compartido.
 *
 * @returns {Promise<void>}
 */
async function cargarNotificacionesInterno() {
    const datos = await cargarNotificacionesCompartidas(API);
    if (datos) notificaciones = datos;
}

/**
 * Descarga las notificaciones sin duplicar peticiones simultáneas.
 *
 * @returns {Promise<void>}
 */
function cargarNotificaciones() {
    return Concurrencia.ejecutar(
        "ciudadano:notificaciones",
        () => cargarNotificacionesInterno()
    );
}
