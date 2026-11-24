/**
 * @file Renderizado del panel de control.
 *
 * Pinta los sectores, la tabla de reportes y las clases de estado.
 *
 * @module frontend/pages/control/render
 */

/**
 * Dibuja una barra proporcional por localidad.
 *
 * @param {Array<{localidad: string, total: number}>} lista - Datos ordenados.
 * @returns {void}
 */
function renderSectores(lista) {
    const contenedor = document.getElementById("controlSectores");
    if (!lista.length) {
        contenedor.innerHTML = '<div class="empty-state compact-empty"><strong>Sin datos</strong><p>Aún no hay reportes por localidad.</p></div>';
        return;
    }
    const maximo = lista[0]?.total || 1;
    contenedor.innerHTML = lista.map((item) => `
        <div class="sector-row">
            <div class="sector-heading"><strong>${features.escapeHTML(item.localidad)}</strong><span>${item.total} reporte${item.total === 1 ? "" : "s"}</span></div>
            <div class="sector-track"><span style="width:${Math.round(item.total / maximo * 100)}%"></span></div>
        </div>
    `).join("");
}

/**
 * Traduce el estado del reporte a la clase visual de la tabla.
 *
 * @param {string} estado - Estado del reporte.
 * @returns {'is-active'|'is-process'|'is-pending'} Clase CSS.
 */
function estadoClase(estado) {
    if (estado === "completado") return "is-active";
    if (estado === "en proceso") return "is-process";
    return "is-pending";
}

/**
 * Pinta la tabla de reportes visibles para el ente de control.
 *
 * @returns {void}
 */
function renderReportes() {
    const body = document.getElementById("controlReportesTabla");
    if (!reportes.length) {
        body.innerHTML = '<tr><td colspan="7"><div class="empty-state compact-empty"><strong>Sin reportes</strong><p>No hay reportes con los filtros seleccionados.</p></div></td></tr>';
        return;
    }

    body.innerHTML = reportes.map((reporte) => `
        <tr>
            <td>
                <div class="table-user">
                    <span>${features.escapeHTML((reporte.tipo || "R").charAt(0).toUpperCase())}</span>
                    <div><strong>${features.escapeHTML(reporte.tipo || "Reporte")}</strong><small>${features.escapeHTML(reporte.localidad || "Sin localidad")} · ${features.escapeHTML(reporte.ubicacion || "")}</small></div>
                </div>
            </td>
            <td>${features.escapeHTML(reporte.ciudadano || "—")}</td>
            <td>${features.escapeHTML(reporte.operario || "Sin asignar")}${reporte.empresa ? `<small>${features.escapeHTML(reporte.empresa)}</small>` : ""}</td>
            <td><span class="account-status ${estadoClase(reporte.estado)}">${features.escapeHTML(reporte.estado || "pendiente")}</span></td>
            <td>${Number(reporte.seguimientos || 0)}</td>
            <td>${features.escapeHTML(features.relativeTime(reporte.fecha))}</td>
            <td><button class="table-action" type="button" data-accion="verReporte" data-args='[${Number(reporte.id)}]'>Ver</button></td>
        </tr>
    `).join("");
}
