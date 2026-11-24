/**
 * @file Localidades del panel de control.
 *
 * Rellena el filtro con las 20 localidades oficiales.
 *
 * @module frontend/pages/control/localidades
 */

/**
 * Rellena el selector de localidades con las 20 oficiales ordenadas.
 *
 * @returns {void}
 */
function llenarLocalidades() {
    const select = document.getElementById("filtroLocalidad");
    if (!select) return;
    const lista = (features.localidades || []).slice().sort((a, b) => a.localeCompare(b, "es"));
    select.innerHTML = '<option value="">Todas</option>'
        + lista.map((item) => `<option value="${features.escapeHTML(item)}">${features.escapeHTML(item)}</option>`).join("");
}
