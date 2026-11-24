/**
 * @file Formulario de reportes del panel ciudadano.
 *
 * Controla el modal de creación, la vista previa de la imagen, la
 * geolocalización y el envío del reporte.
 *
 * @module frontend/pages/ciudadano/formulario
 */

function abrirNuevoReporte() {
    if (!exigirUsuario()) return;

    if (reporteDelDia() >= Number(configuracion.limite_reportes_diarios || 5)) {
        mostrarToast(`Alcanzaste el límite de ${configuracion.limite_reportes_diarios || 5} reportes diarios.`);
        return;
    }

    document.getElementById("modalTitulo").textContent = "Nuevo reporte";
    document.getElementById("modalCard").classList.add("modal-card-wide");
    document.getElementById("modalContenido").innerHTML = `
        <div class="form-intro">
            <span aria-hidden="true">📍</span>
            <p><strong>Ubicación automática</strong><br>El GPS se activará al abrir el formulario. También puedes escribir la dirección manualmente.</p>
        </div>
        <div class="input-group">
            <label for="nuevoTipo">Tipo de residuo</label>
            <select id="nuevoTipo">
                <option>Acumulación de residuos</option>
                <option>Basura en vía pública</option>
                <option>Residuos en zona verde</option>
                <option>Otro</option>
            </select>
        </div>
        <div class="input-group">
            <label for="nuevaLocalidad">Localidad</label>
            <select id="nuevaLocalidad" required>
                <option value="">Selecciona una localidad</option>
                ${features.localidades.map((localidad) => `<option value="${localidad}">${localidad}</option>`).join("")}
            </select>
            <div class="file-help">Usaremos la localidad para asignar automáticamente un operario.</div>
        </div>
        <div class="input-group">
            <label for="nuevaUbicacion">Ubicación</label>
            <div class="gps-row">
                <input id="nuevaUbicacion" placeholder="Ej: Calle 25 #15-20" autocomplete="street-address">
                <button class="small-button" id="gpsButton" type="button" data-accion="usarUbicacion">📍 GPS</button>
            </div>
            <input type="hidden" id="nuevaLatitud">
            <input type="hidden" id="nuevaLongitud">
            <div class="field-status" id="gpsStatus">Esperando ubicación GPS...</div>
        </div>
        <div class="input-group">
            <div class="label-row"><label for="nuevaDescripcion">Descripción</label><span id="descripcionContador">0/100</span></div>
            <textarea id="nuevaDescripcion" maxlength="100" placeholder="Describe brevemente lo que encontraste" data-accion="actualizarContadorDescripcion"></textarea>
        </div>
        <div class="input-group">
            <label for="nuevaImagen">Foto del reporte <span class="required-mark">*</span></label>
            <input id="nuevaImagen" type="file" accept="image/jpeg,image/png,image/webp" required data-accion="previsualizarImagen" data-pasar="elemento">
            <div class="file-help">JPG, PNG o WEBP. Máximo 8 MB.</div>
            <img id="imagenPreview" class="image-preview" alt="Vista previa de la foto">
        </div>
        <button class="primary" id="enviarReporteButton" type="button" data-accion="guardarReporte">📤 Enviar reporte</button>`;

    document.getElementById("modal").classList.add("show");
    usarUbicacion();
}

/**
 * Cuenta los reportes creados hoy para respetar el límite diario.
 *
 * @returns {number} Cantidad de reportes del día.
 */
function reporteDelDia() {
    const today = new Date();
    return reportes.filter((report) => {
        const date = new Date(report.fecha);
        return date.getFullYear() === today.getFullYear()
            && date.getMonth() === today.getMonth()
            && date.getDate() === today.getDate();
    }).length;
}

/**
 * Muestra la vista previa de la foto elegida y valida el tamaño.
 *
 * @param {HTMLInputElement} input - Campo de archivo.
 * @returns {void}
 */
function previsualizarImagen(input) {
    const image = document.getElementById("imagenPreview");
    const file = input.files[0];

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    if (!file) {
        image.style.display = "none";
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        input.value = "";
        image.style.display = "none";
        mostrarToast("La foto supera el límite de 8 MB.");
        return;
    }

    previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    image.style.display = "block";
}

/**
 * Solicita la geolocalización del navegador y rellena las coordenadas
 * ocultas del formulario.
 *
 * @returns {void}
 */
function usarUbicacion() {
    const button = document.getElementById("gpsButton");
    const status = document.getElementById("gpsStatus");

    if (!navigator.geolocation) {
        status.textContent = "GPS no disponible. Ingresa la dirección manualmente.";
        status.className = "field-status is-warning";
        return;
    }

    button.disabled = true;
    button.textContent = "⏳ Ubicando";
    status.textContent = "Obteniendo tu ubicación...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            document.getElementById("nuevaLatitud").value = latitude;
            document.getElementById("nuevaLongitud").value = longitude;
            document.getElementById("nuevaUbicacion").value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            status.textContent = `GPS activo · precisión aproximada: ${Math.round(position.coords.accuracy)} m`;
            status.className = position.coords.accuracy <= 20 ? "field-status is-success" : "field-status is-warning";
            button.disabled = false;
            button.textContent = "✓ GPS";
        },
        (error) => {
            const messages = {
                1: "Permiso denegado. Ingresa la dirección manualmente.",
                2: "No se pudo determinar la ubicación.",
                3: "La solicitud de GPS tardó demasiado."
            };
            status.textContent = messages[error.code] || "GPS no disponible. Ingresa la dirección manualmente.";
            status.className = "field-status is-warning";
            button.disabled = false;
            button.textContent = "📍 GPS";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

/**
 * Valida el formulario y envía el reporte como `multipart/form-data`.
 *
 * @returns {Promise<void>}
 */
async function guardarReporte() {
    if (!exigirUsuario()) return;

    const type = document.getElementById("nuevoTipo").value;
    const locality = document.getElementById("nuevaLocalidad").value;
    const locationInput = document.getElementById("nuevaUbicacion");
    const location = locationInput.value.trim();
    const description = document.getElementById("nuevaDescripcion").value.trim();
    const imageInput = document.getElementById("nuevaImagen");
    const image = imageInput.files[0];
    const latitude = document.getElementById("nuevaLatitud").value;
    const longitude = document.getElementById("nuevaLongitud").value;
    const button = document.getElementById("enviarReporteButton");

    if (!locality) {
        mostrarToast("Selecciona la localidad del reporte.");
        return;
    }

    if (!location) {
        mostrarToast("Ingresa o activa la ubicación del reporte.");
        return;
    }

    if (!description) {
        mostrarToast("Escribe una breve descripción.");
        return;
    }

    if (description.length > 100) {
        mostrarToast("La descripción puede tener máximo 100 caracteres.");
        return;
    }

    if (!image) {
        mostrarToast("Adjunta una foto para enviar el reporte.");
        return;
    }

    /* El límite diario se configura desde el panel de administración. */
    if (reporteDelDia() >= Number(configuracion.limite_reportes_diarios || 5)) {
        mostrarToast(`Alcanzaste el límite de ${configuracion.limite_reportes_diarios || 5} reportes diarios.`);
        return;
    }

    const formData = new FormData();
    formData.append("usuario_id", usuarioActual.id);
    formData.append("tipo", type);
    formData.append("ubicacion", location);
    formData.append("localidad", locality);
    formData.append("descripcion", description);
    if (latitude) formData.append("latitud", latitude);
    if (longitude) formData.append("longitud", longitude);
    formData.append("imagen", image);

    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = "Enviando reporte...";

    try {
        const response = await features.apiFetch(`${API}/api/reportes`, { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || "No se pudo enviar el reporte.");

        cerrarModal();
        limpiarFormularioReporte();
        await cargarReportes(true);
        mostrarToast(data.mensaje || "Reporte enviado correctamente.");
    } catch (error) {
        console.error(error);
        mostrarToast(navigator.onLine
            ? error.message || "No se pudo enviar el reporte."
            : "No hay conexión. El reporte sigue abierto para enviarlo luego.");
    } finally {
        if (button.isConnected) {
            button.disabled = false;
            button.classList.remove("is-loading");
            button.textContent = "📤 Enviar reporte";
        }
    }
}

/**
 * Libera la URL temporal usada para la vista previa de la foto.
 *
 * @returns {void}
 */
function limpiarFormularioReporte() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
}
