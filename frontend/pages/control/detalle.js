/**
 * @file Detalle de reportes del panel de control.
 *
 * Abre el reporte con su historial de seguimientos y el formulario
 * para registrar uno nuevo.
 *
 * @module frontend/pages/control/detalle
 */

/**
 * Abre el detalle de un reporte con su historial de seguimientos y el
 * formulario para registrar uno nuevo.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {Promise<void>}
 */
async function verReporte(id) {
    try {
        const response = await features.apiFetch(`${API}/api/control/reportes/${id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudo cargar el reporte.");

        const reporte = data.reporte;
        const seguimientos = data.seguimientos || [];
        const esAdmin = usuarioActual?.tipo_usuario === "admin";
        const nombreEnte = NOMBRES_ENTE[usuarioActual?.tipo_usuario] || "tu ente";
        reporteAbierto = reporte.id;

        document.getElementById("controlModalTitle").textContent = `Reporte #${reporte.id}`;
        document.getElementById("controlModalContent").innerHTML = `
            <div class="detail-grid">
                <div class="detail-row"><span class="detail-label">Tipo</span><div class="detail-value">${features.escapeHTML(reporte.tipo || "")}</div></div>
                <div class="detail-row"><span class="detail-label">Estado</span><div class="detail-value"><span class="account-status ${estadoClase(reporte.estado)}">${features.escapeHTML(reporte.estado || "")}</span></div></div>
                <div class="detail-row"><span class="detail-label">Localidad</span><div class="detail-value">${features.escapeHTML(reporte.localidad || "Sin localidad")}</div></div>
                <div class="detail-row"><span class="detail-label">Dirección</span><div class="detail-value">${features.escapeHTML(reporte.ubicacion || "")}</div></div>
                <div class="detail-row"><span class="detail-label">Descripción</span><div class="detail-value">${features.escapeHTML(reporte.descripcion || "Sin descripción")}</div></div>
                <div class="detail-row"><span class="detail-label">Ciudadano</span><div class="detail-value">${features.escapeHTML(reporte.ciudadano || "")}</div></div>
                <div class="detail-row"><span class="detail-label">Operario</span><div class="detail-value">${features.escapeHTML(reporte.operario || "Sin asignar")}${reporte.empresa ? ` · ${features.escapeHTML(reporte.empresa)}` : ""}</div></div>
                <div class="detail-row"><span class="detail-label">Fecha</span><div class="detail-value">${features.escapeHTML(new Date(reporte.fecha).toLocaleString("es-CO"))}</div></div>
            </div>

            ${reporte.imagen_url ? `<div class="report-detail-image">${features.reporteImagen(API, reporte, "detail-thumb", "🗑️")}</div>` : ""}
            ${reporte.imagen_operario_url ? `<div class="report-detail-image">${features.reporteImagen(API, { ...reporte, imagen_url: reporte.imagen_operario_url }, "detail-thumb", "🗑️")}</div>` : ""}

            <h4 class="modal-section-title">Historial de seguimientos${esAdmin ? "" : ` · ${features.escapeHTML(nombreEnte)}`}</h4>
            <p class="section-subtitle">${esAdmin
                ? "Vista global: seguimientos de todos los entes."
                : "Solo se muestran los seguimientos registrados por tu ente."}</p>
            <div class="control-history">
                ${seguimientos.length ? seguimientos.map((item) => `
                    <div class="control-history-item">
                        <div class="control-history-head">
                            <strong>${features.escapeHTML(NOMBRES_TIPO_SEGUIMIENTO[item.tipo] || item.tipo)}</strong>
                            <span>${features.escapeHTML(NOMBRES_ENTE[item.ente] || item.ente)} · ${features.escapeHTML(item.autor || "")}</span>
                        </div>
                        <p>${features.escapeHTML(item.mensaje)}</p>
                        <small>${features.escapeHTML(new Date(item.fecha).toLocaleString("es-CO"))} · Estado: ${features.escapeHTML(item.estado_reportado || "—")}</small>
                    </div>
                `).join("") : `<div class="empty-state compact-empty"><strong>Sin seguimientos</strong><p>${
                    esAdmin
                        ? "Este reporte todavía no tiene observaciones."
                        : "Tu ente aún no ha registrado seguimientos en este reporte."
                }</p></div>`}
            </div>

            <h4 class="modal-section-title">Registrar seguimiento</h4>
            <div class="input-group">
                <label for="seguimientoTipo">Tipo</label>
                <select id="seguimientoTipo">
                    <option value="observacion">Observación</option>
                    <option value="requerimiento">Requerimiento</option>
                    <option value="visita">Visita</option>
                    <option value="cierre">Cierre</option>
                </select>
            </div>
            <div class="input-group">
                <label for="seguimientoMensaje">Mensaje</label>
                <textarea id="seguimientoMensaje" rows="4" maxlength="1000" placeholder="Describe la observación o el requerimiento (mínimo 5 caracteres)."></textarea>
            </div>
            <button class="admin-primary-button full-admin-button" type="button" data-accion="enviarSeguimiento" data-args='[${Number(reporte.id)}]'>Guardar seguimiento</button>
        `;

        document.getElementById("controlModal").classList.add("show");
    } catch (error) {
        mostrarToast(error.message);
    }
}
