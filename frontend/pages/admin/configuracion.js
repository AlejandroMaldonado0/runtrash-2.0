/**
 * @file Configuración del panel administrador.
 *
 * Guarda los parámetros globales del sistema.
 *
 * @module frontend/pages/admin/configuracion
 */

/**
 * Guarda los parámetros del formulario de configuración.
 *
 * @param {SubmitEvent} event - Evento del formulario.
 * @returns {Promise<void>}
 */
async function guardarConfiguracion(event) {
    event.preventDefault();
    const button = document.getElementById("saveConfigButton");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    button.disabled = true;
    button.textContent = "Guardando...";
    try {
        await apiFetch(`${API}/api/admin/configuracion`, { method: "PUT", body: JSON.stringify(values) });
        await cargarTodo();
        mostrarToast("Configuración actualizada.");
    } catch (error) { mostrarToast(error.message); }
    finally { button.disabled = false; button.textContent = "Guardar configuración"; }
}
