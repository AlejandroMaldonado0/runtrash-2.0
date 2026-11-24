/**
 * @file Carga de datos del panel administrador.
 *
 * Descarga resumen, usuarios, configuración y notificaciones, y
 * coordina las peticiones para evitar cargas superpuestas.
 *
 * @module frontend/pages/admin/datos
 */

/**
 * Descarga las notificaciones del administrador con el helper compartido.
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
        "admin:notificaciones",
        () => cargarNotificacionesInterno()
    );
}

/**
 * Carga resumen, usuarios y configuración en paralelo y repinta el panel.
 *
 * @param {AbortSignal} [signal] - Señal para cancelar las peticiones al salir.
 * @returns {Promise<void>}
 */
async function cargarTodoInterno(signal = undefined) {
    if (!token || usuarioActual?.tipo_usuario !== "admin") {
        mostrarGate();
        return;
    }

    try {
        /*
        Las tres consultas son independientes: se piden en paralelo para
        que el panel aparezca completo con una sola espera.
        */
        const opciones = signal ? { signal } : undefined;
        const [summaryData, usersData, configData] = await Promise.all([
            apiFetch(`${API}/api/admin/resumen`, opciones),
            apiFetch(`${API}/api/admin/usuarios`, opciones),
            apiFetch(`${API}/api/admin/configuracion`, opciones)
        ]);
        resumen = {
            ...summaryData.resumen,
            estados: summaryData.estados,
            sectores: summaryData.sectores,
            recientes: summaryData.recientes,
            usuarios_por_rol: summaryData.usuarios_por_rol
        };
        usuarios = usersData.usuarios;
        configuracion = Object.fromEntries(configData.configuracion.map((item) => [item.clave, item.valor]));
        renderResumen();
        renderUsuarios();
        renderConfiguracion();
    } catch (error) {
        if (error?.name === "AbortError") return;
        mostrarToast(error.message);
    }
}

/**
 * Carga el panel completo a través del coordinador de peticiones.
 *
 * @returns {Promise<void>}
 */
function cargarTodo() {
    return Concurrencia.ejecutar(
        "admin:todo",
        (signal) => cargarTodoInterno(signal)
    );
}
