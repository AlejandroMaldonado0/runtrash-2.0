/**
 * @file Registro de ciudadanos de la página de inicio.
 *
 * El registro público solo crea cuentas de ciudadano. Empresas y
 * operarios los da de alta un administrador (o una empresa, para sus
 * propios operarios) después de verificar el NIT y la identidad.
 *
 * @module frontend/pages/inicio/registro
 */

/**
 * Abre el modal de registro.
 *
 * @returns {void}
 */
function abrirRegistro() {
    document.getElementById("modalRegistro").classList.add("active");
}

/**
 * Cierra el modal de registro.
 *
 * @returns {void}
 */
function cerrarRegistro() {
    document.getElementById("modalRegistro").classList.remove("active");
}

/**
 * Marca el tipo de cuenta del registro.
 *
 * Solo existe el botón de ciudadano; se conserva la función para que
 * los manejadores `data-accion` sigan funcionando si se añaden tipos
 * en el futuro.
 *
 * @param {HTMLElement} boton - Botón pulsado con `data-tipo`.
 * @returns {void}
 */
function seleccionarTipoRegistro(boton) {
    const modal = document.getElementById("modalRegistro");
    const botones = modal.querySelectorAll(".tipo-btn");

    botones.forEach(function (btn) {
        btn.classList.remove("active");
    });

    boton.classList.add("active");
    tipoRegistro = "ciudadano";
}

/**
 * Pinta un error en el formulario de registro.
 *
 * @param {string} texto - Mensaje para el usuario.
 * @returns {void}
 */
function mostrarError(texto) {
    const mensaje = document.getElementById("mensajeRegistro");
    mensaje.className = "mensaje error";
    mensaje.innerText = texto;
}

/**
 * Valida los campos y crea la cuenta de ciudadano en la API.
 *
 * @returns {Promise<void>}
 */
async function registrarUsuario() {
    const mensaje = document.getElementById("mensajeRegistro");
    mensaje.className = "mensaje";

    const nombre = document.getElementById("registroNombre").value.trim();
    const email = document.getElementById("registroEmail").value.trim().toLowerCase();
    const password = document.getElementById("registroPassword").value;
    const password2 = document.getElementById("registroPassword2").value;
    const fechaNacimiento = document.getElementById("registroFechaNacimiento").value;

    if (!nombre || !email || !password || !password2) {
        mostrarError("Completa todos los campos obligatorios.");
        return;
    }

    if (!fechaNacimiento) {
        mostrarError("Completa tu fecha de nacimiento.");
        return;
    }

    if (password !== password2) {
        mostrarError("Las contraseñas no coinciden.");
        return;
    }

    if (password.length < 8) {
        mostrarError("La contraseña debe tener mínimo 8 caracteres.");
        return;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        mostrarError("La contraseña debe incluir al menos una letra y un número.");
        return;
    }

    try {
        const respuesta = await fetch(API + "/api/registro", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nombre: nombre,
                correo: email,
                password: password,
                tipo_usuario: "ciudadano",
                fecha_nacimiento: fechaNacimiento
            })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mostrarError(
                resultado.mensaje || "No se pudo registrar el usuario."
            );
            return;
        }

        mensaje.className = "mensaje exito";
        mensaje.innerText = "¡Cuenta creada correctamente!";

        document.getElementById("registroNombre").value = "";
        document.getElementById("registroEmail").value = "";
        document.getElementById("registroPassword").value = "";
        document.getElementById("registroPassword2").value = "";
    } catch (error) {
        console.error("Error conectando con el servidor:", error);
        mostrarError("No se pudo conectar con el servidor.");
    }
}
