/**
 * @file Renderizado del panel administrador.
 *
 * Pinta los indicadores, sectores, usuarios, configuración y
 * actividad reciente.
 *
 * @module frontend/pages/admin/render
 */

/**
 * Pinta las tarjetas de indicadores y las secciones derivadas.
 *
 * @returns {void}
 */
function renderResumen() {
    document.getElementById("adminUsuarios").textContent = resumen.usuarios || 0;
    document.getElementById("adminReportes").textContent = resumen.reportes || 0;
    document.getElementById("adminPendientes").textContent = resumen.estados?.find((item) => item.estado === "pendiente")?.total || 0;
    document.getElementById("adminHoy").textContent = resumen.reportes_hoy || 0;
    renderSectores();
    renderActividad();
}

/**
 * Dibuja el desglose de reportes por localidad.
 *
 * @returns {void}
 */
function renderSectores() {
    const sectors = resumen.sectores || [];
    const container = document.getElementById("adminSectores");
    if (!sectors.length) {
        container.innerHTML = '<div class="empty-state compact-empty"><span class="empty-state-icon">📊</span><strong>Sin datos recientes</strong><p>Los reportes por localidad aparecerán aquí.</p></div>';
        return;
    }
    const max = Math.max(...sectors.map((item) => item.total), 1);
    container.innerHTML = sectors.map((sector) => `
        <div class="sector-row">
            <div class="sector-heading"><strong>${features.escapeHTML(sector.sector)}</strong><span>${sector.total} reporte${sector.total === 1 ? "" : "s"}</span></div>
            <div class="sector-track"><span style="width:${Math.round(sector.total / max * 100)}%"></span></div>
            <div class="sector-detail"><span>${sector.pendientes} pendiente${sector.pendientes === 1 ? "" : "s"}</span><span>${sector.completados} completado${sector.completados === 1 ? "" : "s"}</span></div>
        </div>`).join("");
}

/**
 * Pinta la tabla de usuarios con su rol y acciones disponibles.
 *
 * @returns {void}
 */
function renderUsuarios() {
    const body = document.getElementById("adminUsuariosTabla");
    const busqueda = (document.getElementById("usuariosBusqueda")?.value || "").trim().toLowerCase();
    const filtroRol = document.getElementById("usuariosFiltroRol")?.value || "";
    const usuariosFiltrados = usuarios.filter((user) => {
        if (filtroRol && user.tipo_usuario !== filtroRol) return false;
        if (!busqueda) return true;
        const nombre = String(user.nombre || "").toLowerCase();
        const correo = String(user.correo || "").toLowerCase();
        return nombre.includes(busqueda) || correo.includes(busqueda);
    });
    body.innerHTML = usuariosFiltrados.map((user) => {
        const rolInfo = ({
            ciudadano: { emoji: "👤", etiqueta: "Ciudadano" },
            operario: { emoji: "👷", etiqueta: "Operario" },
            empresa: { emoji: "🏢", etiqueta: "Empresa" },
            admin: { emoji: "🛡️", etiqueta: "Administrador" },
            distrito: { emoji: "🏛️", etiqueta: "Distrito" },
            policia: { emoji: "🚓", etiqueta: "Policía" },
            sspd: { emoji: "⚖️", etiqueta: "SSPD" }
        })[user.tipo_usuario] || { emoji: "🌱", etiqueta: user.tipo_usuario };
        const role = `${rolInfo.emoji} ${rolInfo.etiqueta}`;
        const detail = user.tipo_usuario === "operario" ? `${user.zona_asignada || "Sin zona"}${user.tiene_codigo_verificacion ? " · código activo" : " · sin código (no puede ingresar)"}` : user.tipo_usuario === "empresa" ? (user.nit_empresa || "Sin NIT") : user.codigo_operario || "—";
        return `<tr class="${user.activo ? "" : "is-disabled"}">
            <td><div class="table-user"><span>${features.escapeHTML(user.nombre.charAt(0).toUpperCase())}</span><div><strong>${features.escapeHTML(user.nombre)}</strong><small>${features.escapeHTML(user.correo)}</small></div></div></td>
            <td><span class="role-badge role-${features.escapeHTML(user.tipo_usuario)}">${role}</span></td>
            <td>${features.escapeHTML(detail)}</td>
            <td>${user.reportes}</td>
            <td><span class="account-status ${user.activo ? "is-active" : "is-inactive"}">${user.activo ? "Activo" : "Inactivo"}</span></td>
            <td><div class="table-actions">${user.tipo_usuario !== "admin" ? `<button class="table-action" type="button" data-accion="editarUsuarioAdmin" data-args='[${Number(user.id)}]'>Editar</button><button class="table-action" type="button" data-accion="restablecerPasswordAdmin" data-args='[${Number(user.id)}]'>Clave</button>${user.tipo_usuario === "operario" ? `<button class="table-action" type="button" data-accion="generarCodigoUsuarioAdmin" data-args='[${Number(user.id)}]'>Código</button>` : ""}` : ""}${Number(user.id) !== Number(usuarioActual?.id) ? `<button class="table-action" type="button" data-accion="alternarUsuario" data-args='[${Number(user.id)},${user.activo}]'>${user.activo ? "Desactivar" : "Activar"}</button>` : `<span class="account-status is-active">Actual</span>`}</div></td>
        </tr>`;
    }).join("");
}

/**
 * Rellena el formulario de configuración con los valores guardados.
 *
 * @returns {void}
 */
function renderConfiguracion() {
    const form = document.getElementById("configForm");
    Object.entries(configuracion).forEach(([key, value]) => {
        const input = form.elements[key];
        if (input) input.value = value;
    });
}

/**
 * Lista los reportes recientes con su estado.
 *
 * @returns {void}
 */
function renderActividad() {
    const reports = resumen.recientes || [];
    const container = document.getElementById("adminActividad");
    if (!reports.length) {
        container.innerHTML = '<div class="empty-state compact-empty"><span class="empty-state-icon">🕘</span><strong>Sin actividad reciente</strong></div>';
        return;
    }
    container.innerHTML = reports.map((report) => `
        <button class="activity-item" type="button" data-accion="verReporteAdmin" data-args='[${Number(report.id)}]'>
            <span class="activity-icon ${report.estado === "completado" ? "done" : report.estado === "en proceso" ? "progress" : "pending"}">${report.estado === "completado" ? "✓" : report.estado === "en proceso" ? "↻" : "!"}</span>
            <div><strong>${features.escapeHTML(report.tipo)}</strong><p>${features.escapeHTML(report.localidad || "Por geolocalizar")} · ${features.escapeHTML(report.ciudadano)}</p></div>
            <span class="status ${report.estado === "completado" ? "done" : report.estado === "en proceso" ? "progress" : "pending"}">${features.escapeHTML(report.estado)}</span>
        </button>`).join("");
}
