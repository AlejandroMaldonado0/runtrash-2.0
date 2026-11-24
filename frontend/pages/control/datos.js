/**
 * @file Carga de datos del panel de control.
 *
 * Consulta el resumen y los reportes filtrados, y coordina los
 * refrescos en paralelo.
 *
 * @module frontend/pages/control/datos
 */

/**
 * Carga los indicadores del panel y pinta el resumen por localidad.
 *
 * @param {AbortSignal} [signal] - Señal para cancelar la petición al salir.
 * @returns {Promise<void>}
 * @throws {Error} Si la API responde con error.
 */
async function cargarResumenInterno(signal = undefined) {
    const response = await features.apiFetch(
        `${API}/api/control/resumen`,
        signal ? { signal } : undefined
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || "No se pudo cargar el resumen.");
    resumen = data.resumen || {};

    document.getElementById("controlTotal").textContent = resumen.total ?? 0;
    document.getElementById("controlPendientes").textContent = resumen.pendientes ?? 0;
    document.getElementById("controlProceso").textContent = resumen.en_proceso ?? 0;
    document.getElementById("controlCompletados").textContent = resumen.completados ?? 0;

    /*
    El backend cuenta solo los seguimientos del ente autenticado (el
    administrador recibe el total global). La etiqueta deja claro que
    la cifra no mezcla la actividad de otros entes.
    */
    const totalSeguimientos = Number(resumen.seguimientos?.total ?? 0);
    const esAdmin = usuarioActual?.tipo_usuario === "admin";
    const badge = document.getElementById("controlSeguimientosBadge");
    badge.textContent = `${totalSeguimientos} seguimiento${totalSeguimientos === 1 ? "" : "s"}`
        + (esAdmin ? "" : " de mi ente");
    badge.title = esAdmin
        ? "Historial completo de la ciudad."
        : "Solo se cuentan los seguimientos registrados por tu ente.";

    renderSectores(resumen.por_localidad || []);
}

/**
 * Carga el resumen a través del coordinador de peticiones.
 *
 * @returns {Promise<void>}
 */
function cargarResumen() {
    return Concurrencia.ejecutar(
        "control:resumen",
        (signal) => cargarResumenInterno(signal)
    );
}

/**
 * Recoge los filtros del formulario como parámetros de consulta.
 *
 * @returns {URLSearchParams} Parámetros listos para la API.
 */
function filtrosActuales() {
    const params = new URLSearchParams();
    const estado = document.getElementById("filtroEstado").value;
    const localidad = document.getElementById("filtroLocalidad").value;
    const texto = document.getElementById("filtroTexto").value.trim();
    const desde = document.getElementById("filtroDesde").value;
    const hasta = document.getElementById("filtroHasta").value;

    /* Solo se envían los filtros con valor para no limitar la consulta. */
    if (estado) params.set("estado", estado);
    if (localidad) params.set("localidad", localidad);
    if (texto) params.set("texto", texto);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    return params;
}

/**
 * Consulta los reportes con los filtros activos y los pinta.
 *
 * @param {AbortSignal} [signal] - Señal para cancelar la petición al salir.
 * @returns {Promise<void>}
 * @throws {Error} Si la API responde con error.
 */
async function cargarReportesInterno(signal = undefined) {
    const params = filtrosActuales();
    const response = await features.apiFetch(
        `${API}/api/control/reportes?${params.toString()}`,
        signal ? { signal } : undefined
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.mensaje || "No se pudieron cargar los reportes.");
    reportes = data.reportes || [];
    renderReportes();
}

/**
 * Carga los reportes filtrados a través del coordinador de peticiones.
 *
 * @returns {Promise<void>}
 */
function cargarReportes() {
    return Concurrencia.ejecutar(
        "control:reportes",
        (signal) => cargarReportesInterno(signal)
    );
}

/**
 * Recarga resumen, reportes y notificaciones en paralelo.
 *
 * @returns {Promise<void>}
 */
async function refrescarTodo() {
    return Concurrencia.ejecutar("control:todo", async () => {
        /*
        Se espera a las tres tareas aunque una falle: así el estado del
        panel refleja si hubo algún problema sin cancelar las demás.
        */
        const resultados = await Concurrencia.enParaleloSeguro([
            () => cargarResumen(),
            () => cargarReportes(),
            () => cargarNotificaciones()
        ]);
        const fallo = resultados.find((resultado) => !resultado.ok);

        document.getElementById("systemStatus").textContent = fallo
            ? "Sin conexión"
            : "En línea";

        if (fallo) mostrarToast(fallo.error.message);
    });
}
