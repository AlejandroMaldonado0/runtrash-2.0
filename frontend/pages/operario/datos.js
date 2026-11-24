/**
 * @file Carga de datos del panel de operario.
 *
 * Descarga reportes y notificaciones, y coordina las peticiones
 * para evitar cargas superpuestas.
 *
 * @module frontend/pages/operario/datos
 */

async function cargarReportesInterno(silencioso = false, notificar = true, signal = undefined) {
    if (!exigirUsuario(!silencioso)) return;

    try {
        const response = await features.apiFetch(
            `${API}/api/reportes/operario/${usuarioActual.id}`,
            signal ? { signal } : undefined
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudieron cargar los reportes.");

        const anteriores = new Map(reportes.map((report) => [report.id, report.estado]));
        const firstLoad = reportes.length === 0 && !silencioso;
        reportes = data.reportes || [];

        if (notificar && !firstLoad) {
            const nuevos = reportes.filter((report) => !anteriores.has(report.id));
            const cambios = reportes.filter((report) => anteriores.has(report.id) && anteriores.get(report.id) !== report.estado);
            if (nuevos.length || cambios.length) {
                features.notify(
                    "Actualización operativa",
                    `${nuevos.length} reporte(s) nuevo(s) y ${cambios.length} cambio(s) de estado.`
                );
            }
        }

        renderReportes();
        actualizarBadgeNotificaciones(notificaciones);
    } catch (error) {
        if (error?.name === "AbortError") return;
        console.error(error);
        if (!silencioso) mostrarToast(error.message || "No se pudieron cargar los reportes asignados.");
    }
}

/**
 * Carga los reportes asignados a través del coordinador de peticiones.
 *
 * @returns {Promise<void>}
 */
function cargarReportes(silencioso = false, notificar = true) {
    return Concurrencia.ejecutar(
        "operario:reportes",
        (signal) => cargarReportesInterno(silencioso, notificar, signal)
    );
}

/**
 * Pinta los reportes según el filtro y calcula las acciones rápidas de
 * cambio de estado.
 *
 * @returns {void}

/**
 * Descarga las notificaciones del operario con el helper compartido.
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
        "operario:notificaciones",
        () => cargarNotificacionesInterno()
    );
}
