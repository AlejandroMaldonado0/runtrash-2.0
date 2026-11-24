/**
 * @file Carga de datos del panel de empresa.
 *
 * Descarga reportes, operarios y notificaciones, y coordina las
 * peticiones para evitar cargas superpuestas.
 *
 * @module frontend/pages/empresa/datos
 */

/**
 * Descarga reportes y operarios, actualiza listas, analítica y mapa.
 *
 * La empresa se resuelve en el servidor desde el token; el `empresa_id`
 * de `localStorage` solo se usa cuando la sesión es de administrador.
 *
 * @param {boolean} [silencioso=false] - No mostrar errores ni notificaciones.
 * @param {boolean} [notificar=true] - Enviar notificación nativa si hay reportes nuevos.
 * @param {AbortSignal} [signal] - Señal para cancelar las peticiones al salir.
 * @returns {Promise<void>}
 */
async function cargarDatosInterno(silencioso = false, notificar = true, signal = undefined) {
    try {
        /*
        La empresa se resuelve en el servidor desde el token de la
        sesión (dato fresco de la base). No se usa el empresa_id
        guardado en localStorage porque puede estar desactualizado
        y eso dejaba vacío el desplegable de asignación.
        */
        const operatorURL = usuarioActual?.tipo_usuario === "admin" && usuarioActual?.empresa_id
            ? `${API}/api/operarios?empresa_id=${encodeURIComponent(usuarioActual.empresa_id)}`
            : `${API}/api/operarios`;

        const [reportsResponse, operatorsResponse] = await Promise.all([
            features.apiFetch(`${API}/api/reportes`, signal ? { signal } : undefined),
            features.apiFetch(operatorURL, signal ? { signal } : undefined)
        ]);
        const reportsData = await reportsResponse.json();
        const operatorsData = await operatorsResponse.json();

        if (!reportsResponse.ok) throw new Error(reportsData.mensaje || "No se pudieron cargar los reportes.");
        if (!operatorsResponse.ok) throw new Error(operatorsData.mensaje || "No se pudieron cargar los operarios.");

        const anteriores = new Map(reportes.map((report) => [report.id, report.estado]));
        const firstLoad = reportes.length === 0 && !silencioso;
        reportes = reportsData.reportes || [];
        operarios = operatorsData.operarios || [];

        if (notificar && !firstLoad) {
            const nuevos = reportes.filter((report) => !anteriores.has(report.id));
            if (nuevos.length) {
                features.notify(
                    "Nuevo reporte recibido",
                    `${nuevos.length} reporte(s) necesitan revisión.`
                );
            }
        }

        renderReportes();
        actualizarEstadisticas();
        renderAnalytics();
        renderEquipo();
        actualizarBadgeNotificaciones(notificaciones);
        actualizarMapa();
    } catch (error) {
        if (error?.name === "AbortError") return;
        console.error(error);
        if (!silencioso) mostrarToast(error.message || "No se pudieron cargar los datos.");
    }
}

/**
 * Carga reportes y operarios a través del coordinador de peticiones.
 *
 * @returns {Promise<void>}
 */
function cargarDatos(silencioso = false, notificar = true) {
    return Concurrencia.ejecutar(
        "empresa:datos",
        (signal) => cargarDatosInterno(silencioso, notificar, signal)
    );
}

/**
 * Descarga las notificaciones de la empresa.
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
        "empresa:notificaciones",
        () => cargarNotificacionesInterno()
    );
}
