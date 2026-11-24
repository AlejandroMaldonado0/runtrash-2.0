/**
 * @file Sesión del panel administrador.
 *
 * Controla la pantalla de acceso, guarda la sesión y envuelve las
 * peticiones autenticadas.
 *
 * @module frontend/pages/admin/sesion
 */

/**
 * Muestra la pantalla de acceso al panel y oculta la aplicación.
 *
 * @param {string} [message=''] - Mensaje opcional de error.
 * @returns {void}
 */
function mostrarGate(message = "") {
    document.getElementById("adminLoginGate").hidden = false;
    document.getElementById("adminApp").hidden = true;
    const feedback = document.getElementById("adminLoginMessage");
    feedback.hidden = !message;
    feedback.textContent = message;
}

/**
 * Oculta la pantalla de acceso y muestra el panel administrativo.
 *
 * @returns {void}
 */
function ocultarGate() {
    document.getElementById("adminLoginGate").hidden = true;
    document.getElementById("adminApp").hidden = false;
}

/**
 * Autentica al administrador desde la pantalla de acceso y guarda la
 * sesión en `localStorage`.
 *
 * @param {SubmitEvent} event - Evento del formulario.
 * @returns {Promise<void>}
 */
async function iniciarSesionAdmin(event) {
    event.preventDefault();
    const button = document.getElementById("adminLoginButton");
    const feedback = document.getElementById("adminLoginMessage");
    const email = document.getElementById("adminLoginEmail").value.trim();
    const password = document.getElementById("adminLoginPassword").value;

    feedback.hidden = true;
    button.disabled = true;
    button.textContent = "Verificando...";

    try {
        const response = await fetch(`${API}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo: email, password, tipo_usuario: "admin" })
        });
        const data = await response.json();
        if (!response.ok || data.usuario?.tipo_usuario !== "admin") {
            throw new Error(data.mensaje || "Las credenciales no son válidas.");
        }

        /* La sesión se comparte con el resto de paneles. */
        token = data.token;
        usuarioActual = data.usuario;
        localStorage.setItem("runtrash_user", JSON.stringify(usuarioActual));
        localStorage.setItem("runtrash_token", token);
        document.getElementById("adminLoginPassword").value = "";
        ocultarGate();
        await cargarTodo();
        await cargarNotificaciones();
        connectAdminEvents();
    } catch (error) {
        feedback.hidden = false;
        feedback.textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = "Entrar al panel";
    }
}

/**
 * Envoltorio de `fetch` para el panel: añade el token y cierra la
 * sesión ante respuestas 401/403.
 *
 * @param {string} url - URL de la API.
 * @param {RequestInit} [options={}] - Opciones de la petición.
 * @returns {Promise<object>} Cuerpo JSON de la respuesta.
 * @throws {Error} Si la petición falla.
 */
async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("runtrash_user");
        localStorage.removeItem("runtrash_token");
        token = null;
        usuarioActual = null;
        mostrarGate(data.mensaje || "Sesión no autorizada.");
        throw new Error(data.mensaje || "Sesión no autorizada.");
    }
    if (!response.ok) throw new Error(data.mensaje || "La operación no pudo completarse.");
    return data;
}
