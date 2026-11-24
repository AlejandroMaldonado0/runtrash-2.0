/**
 * @file Seguimientos del panel de control.
 *
 * Registra observaciones, requerimientos, visitas y cierres.
 *
 * @module frontend/pages/control/seguimiento
 */

/**
 * Registra una observación, requerimiento, visita o cierre sobre el
 * reporte abierto.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {Promise<void>}
 */
async function enviarSeguimiento(id) {
    const tipo = document.getElementById("seguimientoTipo").value;
    const mensaje = document.getElementById("seguimientoMensaje").value.trim();

    if (mensaje.length < 5) {
        mostrarToast("El seguimiento debe tener al menos 5 caracteres.");
        return;
    }

    /* Tras guardar se recargan los datos y se reabre el mismo reporte. */
    try {
        const response = await features.apiFetch(`${API}/api/control/reportes/${id}/seguimiento`, {
            method: "POST",
            body: JSON.stringify({ tipo, mensaje })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudo guardar el seguimiento.");
        mostrarToast("Seguimiento registrado.");
        await refrescarTodo();
        await verReporte(id);
    } catch (error) {
        mostrarToast(error.message);
    }
}
