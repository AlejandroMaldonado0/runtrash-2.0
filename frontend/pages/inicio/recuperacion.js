/**
 * @file Recuperación de contraseña de la página de inicio.
 *
 * Implementa el asistente de tres pasos (solicitar código, verificar y
 * guardar la nueva clave) contra los endpoints
 * `/api/password/recuperar/*`. Depende de
 * `frontend/pages/inicio/estado.js`.
 *
 * @module frontend/pages/inicio/recuperacion
 */

/**
 * Muestra u oculta el mensaje de error del modal de recuperación.
 *
 * @param {string} mensaje - Texto a mostrar; vacío para ocultar.
 * @returns {void}
 */
function mostrarErrorRecuperacion(mensaje) {
    const caja = document.getElementById("recuperacionError");
    caja.textContent = mensaje || "";
    caja.hidden = !mensaje;
}

/**
 * Cambia el paso visible del asistente de recuperación y actualiza
 * el indicador de progreso.
 *
 * @param {1|2|3} paso - Paso que debe mostrarse.
 * @returns {void}
 */
function pintarPasoRecuperacion(paso) {
    recuperacionEstado.paso = paso;

    document.getElementById("pasoSolicitar").hidden = paso !== 1;
    document.getElementById("pasoVerificar").hidden = paso !== 2;
    document.getElementById("pasoNuevaClave").hidden = paso !== 3;
    document.getElementById("recuperacionExito").hidden = true;
    document.getElementById("pasosRecuperacion").hidden = false;

    document.querySelectorAll("#pasosRecuperacion li").forEach((item) => {
        const numero = Number(item.dataset.paso);
        item.classList.toggle("is-activo", numero === paso);
        item.classList.toggle("is-hecho", numero < paso);
    });

    mostrarErrorRecuperacion("");
}

/**
 * Abre el modal de recuperación y precarga el correo del login.
 *
 * @returns {void}
 */
function abrirRecuperacion() {
    const modal = document.getElementById("modalRecuperacion");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    const correoLogin = document.getElementById("email");
    recuperacionEstado.correo = correoLogin?.value?.trim() || "";
    document.getElementById("correoRecuperacion").value = recuperacionEstado.correo;

    pintarPasoRecuperacion(1);
    document.getElementById("correoRecuperacion").focus();
}

/**
 * Cierra el modal de recuperación y limpia sus campos y estados.
 *
 * @returns {void}
 */
function cerrarRecuperacion() {
    const modal = document.getElementById("modalRecuperacion");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");

    document.getElementById("codigoEnviado").hidden = true;
    document.getElementById("recuperacionExito").hidden = true;
    document.getElementById("codigoRecuperacion").value = "";
    document.getElementById("nuevaPassword").value = "";
    document.getElementById("confirmarPassword").value = "";

    pintarPasoRecuperacion(1);
    document.getElementById("email")?.focus();
}

/**
 * Retrocede a un paso anterior del asistente y enfoca su campo.
 *
 * @param {1|2|3} paso - Paso destino.
 * @returns {void}
 */
function volverPasoRecuperacion(paso) {
    pintarPasoRecuperacion(paso);

    if (paso === 2) {
        document.getElementById("codigoRecuperacion").focus();
    }
}

/**
 * Habilita o deshabilita un botón mientras se espera la respuesta
 * del servidor, evitando envíos duplicados.
 *
 * @param {string} id - Identificador del botón.
 * @param {boolean} activo - `true` para habilitarlo.
 * @returns {void}
 */
function activarBotonRecuperacion(id, activo) {
    const boton = document.getElementById(id);
    boton.disabled = !activo;
    boton.style.opacity = activo ? "1" : "0.6";
    boton.style.pointerEvents = activo ? "auto" : "none";
}

/* Paso 1: pedir el código de recuperación al correo indicado. */
document.getElementById("pasoSolicitar").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const correo = document.getElementById("correoRecuperacion").value.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        mostrarErrorRecuperacion("Ingresa un correo válido.");
        return;
    }

    mostrarErrorRecuperacion("");
    activarBotonRecuperacion("btnSolicitarCodigo", false);

    try {
        const respuesta = await fetch(`${API}/api/password/recuperar/solicitar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo })
        });

        const data = await respuesta.json();

        if (!respuesta.ok) {
            mostrarErrorRecuperacion(data.mensaje || "No se pudo enviar el código.");
            return;
        }

        recuperacionEstado.correo = correo;

        if (data.codigo_demo) {
            document.getElementById("codigoDemo").textContent = data.codigo_demo;
            document.getElementById("codigoEnviado").hidden = false;
        }

        pintarPasoRecuperacion(2);
        document.getElementById("codigoRecuperacion").focus();
    } catch (error) {
        mostrarErrorRecuperacion("No hay conexión con el servidor. Intenta de nuevo.");
    } finally {
        activarBotonRecuperacion("btnSolicitarCodigo", true);
    }
});

/* El campo del código solo admite dígitos y se corta a 6. */
document.getElementById("codigoRecuperacion").addEventListener("input", (evento) => {
    evento.target.value = evento.target.value.replace(/\D/g, "").slice(0, 6);
});

/* Paso 2: verificar que el código exista y no haya expirado. */
document.getElementById("pasoVerificar").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const codigo = document.getElementById("codigoRecuperacion").value.trim();

    if (!/^\d{6}$/.test(codigo)) {
        mostrarErrorRecuperacion("El código debe tener 6 dígitos.");
        return;
    }

    mostrarErrorRecuperacion("");
    activarBotonRecuperacion("btnVerificarCodigo", false);

    try {
        const respuesta = await fetch(`${API}/api/password/recuperar/verificar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                correo: recuperacionEstado.correo,
                codigo
            })
        });

        const data = await respuesta.json();

        if (!respuesta.ok) {
            const detalle = data.intentos_restantes !== undefined
                ? ` Te quedan ${data.intentos_restantes} intentos.`
                : "";
            mostrarErrorRecuperacion((data.mensaje || "Código incorrecto.") + detalle);
            return;
        }

        pintarPasoRecuperacion(3);
        document.getElementById("nuevaPassword").focus();
    } catch (error) {
        mostrarErrorRecuperacion("No hay conexión con el servidor. Intenta de nuevo.");
    } finally {
        activarBotonRecuperacion("btnVerificarCodigo", true);
    }
});

/* Paso 3: guardar la nueva contraseña y mostrar la confirmación. */
document.getElementById("pasoNuevaClave").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const password = document.getElementById("nuevaPassword").value;
    const confirmacion = document.getElementById("confirmarPassword").value;
    const codigo = document.getElementById("codigoRecuperacion").value.trim();

    if (password.length < 8) {
        mostrarErrorRecuperacion("La contraseña debe tener mínimo 8 caracteres.");
        return;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        mostrarErrorRecuperacion("La contraseña debe incluir al menos una letra y un número.");
        return;
    }

    if (password !== confirmacion) {
        mostrarErrorRecuperacion("Las contraseñas no coinciden.");
        return;
    }

    mostrarErrorRecuperacion("");
    activarBotonRecuperacion("btnGuardarNuevaClave", false);

    try {
        const respuesta = await fetch(`${API}/api/password/recuperar/restablecer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                correo: recuperacionEstado.correo,
                codigo,
                password
            })
        });

        const data = await respuesta.json();

        if (!respuesta.ok) {
            mostrarErrorRecuperacion(data.mensaje || "No se pudo actualizar la contraseña.");
            return;
        }

        document.getElementById("pasoNuevaClave").hidden = true;
        document.getElementById("pasosRecuperacion").hidden = true;
        document.getElementById("recuperacionExito").hidden = false;
        document.getElementById("codigoEnviado").hidden = true;

        document.getElementById("email").value = recuperacionEstado.correo;
    } catch (error) {
        mostrarErrorRecuperacion("No hay conexión con el servidor. Intenta de nuevo.");
    } finally {
        activarBotonRecuperacion("btnGuardarNuevaClave", true);
    }
});
