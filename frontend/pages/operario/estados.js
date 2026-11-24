/**
 * @file Cambios de estado del panel de operario.
 *
 * Permite elegir y confirmar el paso de un reporte a en proceso o
 * completado.
 *
 * @module frontend/pages/operario/estados
 */

/**
 * Abre el selector de estado de un reporte.
 *
 * El operario puede elegir libremente entre "en proceso" y "completado".
 * Si se llama con un estado (botón rápido), ese estado llega
 * preseleccionado; si se llama sin argumento, abre el selector neutro.
 *
 * @param {number} id - Identificador del reporte.
 * @param {'en proceso'|'completado'} [state] - Estado preseleccionado.
 * @returns {void}
 */
function solicitarCambioEstado(id, state) {
    const report = reportes.find((item) => item.id === id);
    if (!report) return;
    const item = reporteSeguro(report);

    const estadoActual = report.estado;
    const opciones = [
        { valor: "en proceso", etiqueta: "En proceso", icono: "▶", clase: "progress", ayuda: "La visita está en curso o falta cerrarla." },
        { valor: "completado", etiqueta: "Completado", icono: "✓", clase: "done", ayuda: "El punto de residuos ya fue atendido." }
    ];

    let elegido = state || null;

    /**
     * Redibuja las opciones, resalta la elegida y habilita el guardado
     * solo cuando el estado cambia.
     *
     * @returns {void}
     */
    const pintarOpciones = () => {
        document.getElementById("estadoOpciones").innerHTML = opciones.map((opcion) => {
            const activa = elegido === opcion.valor;
            const actual = estadoActual === opcion.valor;
            return `
                <button class="estado-opcion ${activa ? "is-selected" : ""} ${opcion.clase}" type="button"
                        data-estado="${opcion.valor}" aria-pressed="${activa}">
                    <span class="estado-opcion-icon" aria-hidden="true">${opcion.icono}</span>
                    <span class="estado-opcion-texto">
                        <strong>${opcion.etiqueta}</strong>
                        <small>${opcion.ayuda}</small>
                    </span>
                    ${actual ? '<span class="estado-opcion-tag">Estado actual</span>' : ""}
                </button>`;
        }).join("");

        document.querySelectorAll("#estadoOpciones .estado-opcion").forEach((boton) => {
            boton.addEventListener("click", () => {
                elegido = boton.dataset.estado;
                pintarOpciones();
            });
        });

        const boton = document.getElementById("confirmStateButton");
        const sinCambio = !elegido || elegido === estadoActual;
        boton.disabled = sinCambio;
        boton.classList.toggle("is-disabled", sinCambio);
        boton.textContent = sinCambio ? "Sin cambios" : "Guardar estado";
    };

    document.getElementById("tituloDetalle").textContent = "Cambiar estado del reporte";
    document.getElementById("modalCard").classList.add("modal-card-compact-modal");
    document.getElementById("detalleContenido").innerHTML = `
        <div class="confirmation-icon ${estadoActual === "completado" ? "is-success" : "is-progress"}">⇄</div>
        <h3 class="confirmation-title">¿En qué estado está este reporte?</h3>
        <p class="confirmation-copy">${item.tipo} · ${item.localidad}</p>
        <div class="estado-actual">
            Estado actual: <strong class="status ${claseEstado(estadoActual)}">${textoEstado(estadoActual)}</strong>
        </div>
        <div class="estado-opciones" id="estadoOpciones" role="group" aria-label="Elige el estado del reporte"></div>
        <div class="estado-foto" ${elegido === "completado" ? "" : "hidden"}>
            <label class="estado-foto-label" for="fotoOperario">Foto de evidencia de recolección</label>
            <input id="fotoOperario" type="file" accept="image/png,image/jpeg,image/webp">
            <div class="file-help">Al completar el reporte debes adjuntar una foto del operario. Se verá junto a la foto del ciudadano.</div>
        </div>
        <div class="confirmation-note">Puedes corregir el estado las veces que necesites. Se notificará al ciudadano y a la empresa.</div>
        <div class="modal-actions split-actions">
            <button class="secondary" type="button" data-accion="cerrarDetalles">Cancelar</button>
            <button class="primary" id="confirmStateButton" type="button"
                    data-accion="confirmarCambioEstado" data-args='[${Number(id)}]'>Guardar estado</button>
        </div>`;

    pintarOpciones();
    document.getElementById("modalDetalles").classList.add("show");
}

/**
 * Guarda el estado elegido y refresca la lista de reportes.
 *
 * @param {number} id - Identificador del reporte.
 * @returns {Promise<void>}
 */
async function confirmarCambioEstado(id) {
    if (!usuarioActual?.id) return;

    const elegido = document.querySelector("#estadoOpciones .estado-opcion.is-selected")?.dataset.estado;

    /* Sin selección no hay nada que guardar. */
    if (!elegido) {
        mostrarToast("Selecciona un estado.");
        return;
    }

    const report = reportes.find((item) => item.id === id);
    if (!report || report.estado === elegido) {
        mostrarToast("El reporte ya tiene ese estado.");
        return;
    }

    const button = document.getElementById("confirmStateButton");
    button.disabled = true;
    button.textContent = "Actualizando...";

    try {
        const form = new FormData();
        form.append("estado", elegido);

        const archivo = document.getElementById("fotoOperario")?.files?.[0];
        if (archivo) form.append("foto", archivo);

        const response = await fetch(`${API}/api/reportes/${id}/estado`, {
            method: "PUT",
            body: form
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.mensaje || "No se pudo actualizar el estado.");

        await cargarReportes(true);
        cerrarDetalles();

        mostrarToast(`Reporte actualizado a ${elegido}.`);
    } catch (error) {
        mostrarToast(error.message || "No se pudo actualizar el estado.");
        if (button.isConnected) {
            button.disabled = false;
            button.textContent = "Intentar de nuevo";
            button.classList.remove("is-disabled");
        }
    }
}
