/**
 * @file Equipo operativo del panel de empresa.
 *
 * Lista a los operarios de la empresa y permite generar el código de
 * verificación adicional que se entrega en persona. El código se
 * muestra una sola vez porque el servidor solo guarda su hash.
 *
 * @module frontend/pages/empresa/equipo
 */

/**
 * Desplaza la vista a la sección del equipo operativo.
 *
 * @param {HTMLElement} [menuElement] - Enlace pulsado.
 * @returns {void}
 */
function irAEquipo(menuElement) {
    if (menuElement) seleccionarMenu(menuElement);
    renderEquipo();
    document.getElementById("equipo")
        .scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Genera o rota el código de verificación de un operario.
 *
 * El código se muestra en el modal una sola vez. Al rotarlo, el
 * servidor cierra las sesiones abiertas del operario.
 *
 * @param {number} operarioId - Identificador del operario.
 * @returns {Promise<void>}
 */
async function generarCodigoOperario(operarioId) {
    const operario = operarios.find(
        (item) => Number(item.id) === Number(operarioId)
    );

    try {
        const respuesta = await features.apiFetch(
            `${API}/api/operarios/${Number(operarioId)}/codigo-verificacion`,
            { method: "POST" }
        );
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.mensaje || "No se pudo generar el código."
            );
        }

        const nombre = features.escapeHTML(operario?.nombre || "el operario");

        document.getElementById("modalTitulo").textContent =
            "Código de verificación";
        document.getElementById("modalContenido").innerHTML = `
            <div class="team-code-result">
                <p>
                    Entrega este código a <strong>${nombre}</strong>.
                    No se volverá a mostrar.
                </p>
                <code class="team-code-value">${features.escapeHTML(resultado.codigo_verificacion)}</code>
                <p class="inline-warning">
                    Guárdalo en un lugar seguro. Si el operario lo pierde,
                    genera uno nuevo y el anterior dejará de funcionar.
                </p>
                <button class="primary compact-button" type="button" data-accion="cerrarModal">
                    Entendido
                </button>
            </div>`;
        document.getElementById("modal").classList.add("show");

        if (operario) operario.tiene_codigo_verificacion = true;

        renderEquipo();
    } catch (error) {
        mostrarToast(error.message);
    }
}
