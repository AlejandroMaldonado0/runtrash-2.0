/**
 * @file Exportación del panel de control.
 *
 * Descarga la tabla filtrada como CSV.
 *
 * @module frontend/pages/control/exportar
 */

/**
 * Descarga la tabla filtrada como CSV.
 *
 * @returns {void}
 */
function exportarReportes() {
    try {
        const fecha = new Date().toISOString().slice(0, 10);
        const esAdmin = usuarioActual?.tipo_usuario === "admin";
        features.downloadCSV(
            `reportes-control-${fecha}.csv`,
            [
                "ID",
                "Tipo",
                "Localidad",
                "Estado",
                "Ciudadano",
                "Operario",
                "Empresa",
                esAdmin ? "Seguimientos" : "Seguimientos de mi ente",
                "Fecha"
            ],
            reportes.map((item) => [
                item.id,
                item.tipo || "",
                item.localidad || "",
                item.estado || "",
                item.ciudadano || "",
                item.operario || "Sin asignar",
                item.empresa || "",
                item.seguimientos || 0,
                new Date(item.fecha).toLocaleString("es-CO")
            ])
        );
        mostrarToast("CSV generado correctamente.");
    } catch (error) {
        mostrarToast(error.message);
    }
}
