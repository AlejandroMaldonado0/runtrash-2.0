/**
 * @file Login de la página de inicio.
 *
 * El acceso se divide en dos grupos: Ciudadano y Empresa/organización.
 * Al elegir el segundo se despliegan los roles privilegiados
 * (empresa, operario, distrito, policía y SSPD) con una guía distinta
 * para cada uno. El acceso de administrador no se muestra aquí: se
 * entra directamente por `admin.html`. También gestiona el ingreso con
 * Google y Outlook. Depende de `frontend/pages/inicio/estado.js`.
 *
 * @module frontend/pages/inicio/login
 */

/** Textos de ayuda que se muestran al elegir cada rol. */
const AYUDA_ROLES = {
    ciudadano: "Reporta residuos y sigue el estado de tus solicitudes.",
    empresa: "Gestiona reportes, asigna operarios y genera sus códigos de verificación.",
    operario: "Atiende los reportes asignados con tu código del NIT y el código que te dio tu empresa.",
    distrito: "Consulta reportes de la ciudad y registra tus propios seguimientos.",
    policia: "Consulta reportes de la ciudad y registra tus propios seguimientos.",
    sspd: "Supervisa la operación y registra tus propios seguimientos."
};

/** Mensajes de error devueltos por el callback de OAuth. */
const ERRORES_OAUTH = {
    sin_configurar: "El ingreso con Google u Outlook aún no está configurado en este servidor.",
    cancelado: "Cancelaste el ingreso con el proveedor. Puedes intentarlo de nuevo.",
    respuesta_invalida: "El proveedor devolvió una respuesta incompleta. Intenta otra vez.",
    estado_invalido: "La solicitud de acceso expiró. Vuelve a intentarlo.",
    correo_no_verificado: "El proveedor no confirmó tu correo electrónico.",
    cuenta_no_registrada: "Ese correo no está registrado en RunTrash. Pide a tu empresa o al administrador que cree tu cuenta.",
    cuenta_inactiva: "Tu cuenta está desactivada. Contacta al administrador.",
    operario_con_codigos: "Los operarios deben ingresar con el código del NIT y el código de verificación de su empresa.",
    fallo_proveedor: "No se pudo completar el ingreso con el proveedor. Intenta nuevamente."
};

/**
 * Marca el rol activo y actualiza los campos visibles.
 *
 * @param {string} tipo - Rol elegido.
 * @returns {void}
 */
function marcarRol(tipo) {
    tipoSeleccionado = tipo;

    document.querySelectorAll("#loginForm .tipo-btn").forEach(function (btn) {
        const activo = btn.getAttribute("data-tipo") === tipo;
        btn.classList.toggle("active", activo);
        btn.setAttribute("aria-pressed", String(activo));
    });

    const ayuda = document.getElementById("ayudaRol");

    if (ayuda) ayuda.textContent = AYUDA_ROLES[tipo] || "";

    actualizarCamposRol();
}

/**
 * Campos que el backend pide completar cuando la cuenta real necesita
 * un factor adicional. La clave es el valor de `requiere`.
 */
const CAMPOS_REQUERIDOS = {
    codigo_operario: "codigoOperarioLogin",
    codigo_verificacion: "codigoVerificacionLogin",
    nit_empresa: "nitEmpresaLogin"
};

/**
 * Abre el grupo y marca el rol real de la cuenta cuando el backend
 * detecta que no coincide con el perfil elegido en el formulario.
 *
 * @param {string} rol - Rol real devuelto por el servidor.
 * @returns {void}
 */
function revelarRolReal(rol) {
    const esCiudadano = rol === "ciudadano";
    const botonAcceso = document.querySelector(
        `.acceso-btn[data-acceso="${esCiudadano ? "ciudadano" : "organizacion"}"]`
    );

    if (botonAcceso) seleccionarAcceso(botonAcceso);

    const botonTipo = document.querySelector(
        `#loginForm .tipo-btn[data-tipo="${rol}"]`
    );

    if (botonTipo) {
        marcarRol(rol);
    } else if (!esCiudadano) {
        marcarRol("empresa");
    }
}

/**
 * Muestra u oculta y activa los campos adicionales según el rol.
 *
 * @returns {void}
 */
function actualizarCamposRol() {
    const esOperario = tipoSeleccionado === "operario";
    const esEmpresa = tipoSeleccionado === "empresa";

    document.getElementById("campoOperarioLogin")
        .classList.toggle("visible", esOperario);
    document.getElementById("campoVerificacionLogin")
        .classList.toggle("visible", esOperario);
    document.getElementById("campoEmpresaLogin")
        .classList.toggle("visible", esEmpresa);

    /*
    Solo se exige el campo que corresponde al rol elegido. Así un
    ciudadano o un ente de control no quedan bloqueados por campos que
    ni siquiera ven.

    El operario necesita los dos códigos: el del NIT y el de
    verificación que entrega su empresa. Sin el segundo no puede entrar,
    así que ambos son obligatorios.
    */
    document.getElementById("codigoOperarioLogin").required = esOperario;
    document.getElementById("codigoVerificacionLogin").required = esOperario;
    document.getElementById("nitEmpresaLogin").required = esEmpresa;
}

/**
 * Selecciona el grupo de acceso y despliega los roles si hace falta.
 *
 * @param {HTMLElement} boton - Tarjeta pulsada con `data-acceso`.
 * @returns {void}
 */
function seleccionarAcceso(boton) {
    const acceso = boton.getAttribute("data-acceso");
    const panel = document.getElementById("panelRoles");
    const esOrganizacion = acceso === "organizacion";

    document.querySelectorAll(".acceso-btn").forEach(function (btn) {
        const activo = btn === boton;
        btn.classList.toggle("active", activo);
        btn.setAttribute("aria-pressed", String(activo));

        if (btn.getAttribute("data-acceso") === "organizacion") {
            btn.setAttribute("aria-expanded", String(esOrganizacion));
        }
    });

    panel.hidden = !esOrganizacion;

    if (!esOrganizacion) {
        marcarRol("ciudadano");
        return;
    }

    /*
    Al abrir el grupo se conserva el rol ya elegido o se preselecciona
    Empresa, el caso más común. El usuario puede cambiarlo en el panel.
    */
    const rolActivo = panel.querySelector(".tipo-btn.active")
        || panel.querySelector('.tipo-btn[data-tipo="empresa"]');

    marcarRol(rolActivo.getAttribute("data-tipo") || "empresa");
}

/**
 * Marca el rol elegido dentro del panel de organización.
 *
 * @param {HTMLElement} boton - Botón pulsado con `data-tipo`.
 * @returns {void}
 */
function seleccionarTipo(boton) {
    const panel = document.getElementById("panelRoles");
    const accesoOrganizacion = document.querySelector(
        '.acceso-btn[data-acceso="organizacion"]'
    );

    panel.hidden = false;

    if (accesoOrganizacion) {
        accesoOrganizacion.classList.add("active");
        accesoOrganizacion.setAttribute("aria-pressed", "true");
        accesoOrganizacion.setAttribute("aria-expanded", "true");
    }

    const accesoCiudadano = document.querySelector(
        '.acceso-btn[data-acceso="ciudadano"]'
    );

    if (accesoCiudadano) {
        accesoCiudadano.classList.remove("active");
        accesoCiudadano.setAttribute("aria-pressed", "false");
    }

    marcarRol(boton.getAttribute("data-tipo"));
}

/**
 * Pinta un error en el formulario de login.
 *
 * @param {string} texto - Mensaje para el usuario.
 * @returns {void}
 */
function mostrarErrorLogin(texto) {
    const mensaje = document.getElementById("mensajeLogin");
    mensaje.className = "mensaje error";
    mensaje.innerText = texto;
}

/**
 * Redirige al panel que corresponde al rol real de la cuenta.
 *
 * @param {{tipo_usuario: string}} usuario - Usuario autenticado.
 * @returns {boolean} `true` si el rol tiene panel.
 */
function redirigirPorRol(usuario) {
    const destinos = {
        ciudadano: "ciudadano.html",
        operario: "operario.html",
        empresa: "empresa.html",
        distrito: "control.html",
        policia: "control.html",
        sspd: "control.html",
        admin: "admin.html"
    };
    const destino = destinos[usuario?.tipo_usuario];

    if (!destino) return false;

    window.location.href = destino;
    return true;
}

/**
 * Valida las credenciales, inicia sesión contra la API y redirige al
 * panel correspondiente al tipo de usuario.
 *
 * Operario y empresa deben enviar además su código o NIT, porque el
 * backend los usa para verificar la identidad de la cuenta. Los entes de
 * control solo necesitan correo y contraseña: su rol real se lee de
 * PostgreSQL.
 *
 * @returns {Promise<void>}
 */
async function iniciarSesion() {
    const mensaje = document.getElementById("mensajeLogin");
    mensaje.className = "mensaje";
    mensaje.innerText = "";

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const boton = document.querySelector("#loginForm .main-button");

    if (!email || !password) {
        mostrarErrorLogin("Ingresa tu correo y contraseña.");
        return;
    }

    /*
    Se envían siempre los tres valores, aunque el perfil elegido no los
    muestre. El rol real vive en la base de datos: si la cuenta es de
    empresa u operario, el servidor pedirá el dato que falte en lugar de
    rechazar el ingreso. Así nadie queda bloqueado por haber elegido mal
    el perfil en el formulario.
    */
    const codigo = document.getElementById("codigoOperarioLogin").value.trim();
    const verificacion = document.getElementById("codigoVerificacionLogin").value.trim();
    const nit = document.getElementById("nitEmpresaLogin").value.trim();

    if (boton) {
        boton.disabled = true;
        boton.dataset.textoOriginal = boton.textContent.trim();
        boton.textContent = "Verificando…";
    }

    try {
        const respuesta = await fetch(API + "/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                correo: email,
                password: password,
                tipo_usuario: tipoSeleccionado,
                codigo_operario: codigo,
                codigo_verificacion: verificacion,
                nit_empresa: nit
            })
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            /*
            Si el servidor detectó que la cuenta pertenece a otro rol,
            se abre ese perfil y se enfoca el campo que hace falta sin
            borrar el correo ni la contraseña.
            */
            if (resultado.rol && resultado.rol !== tipoSeleccionado) {
                revelarRolReal(resultado.rol);
            }

            const campo = CAMPOS_REQUERIDOS[resultado.requiere];
            const entrada = campo ? document.getElementById(campo) : null;

            if (entrada) {
                entrada.focus();
                entrada.scrollIntoView({ block: "center", behavior: "smooth" });
            }

            mostrarErrorLogin(
                resultado.mensaje || "Correo o contraseña incorrectos."
            );
            return;
        }

        const usuario = resultado.usuario;

        // El rol real siempre viene de PostgreSQL. Así la misma cuenta
        // puede ingresar desde la web y desde la app aunque el selector
        // visual no coincida.
        localStorage.setItem("runtrash_user", JSON.stringify(usuario));
        localStorage.setItem("runtrash_token", resultado.token);

        if (!redirigirPorRol(usuario)) {
            mostrarErrorLogin(
                "Tu cuenta tiene un rol no habilitado para este acceso."
            );
        }
    } catch (error) {
        console.error("Error conectando con el servidor:", error);
        mostrarErrorLogin("No se pudo conectar con el servidor.");
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = boton.dataset.textoOriginal || "Iniciar sesión";
        }
    }
}

/**
 * Inicia el flujo OAuth con Google o Microsoft/Outlook.
 *
 * @param {"google"|"microsoft"} proveedor - Proveedor elegido.
 * @returns {void}
 */
function ingresarConOAuth(proveedor) {
    const mensaje = document.getElementById("mensajeLogin");
    mensaje.className = "mensaje";
    mensaje.innerText = "";

    const boton = document.querySelector(
        `.oauth-btn[data-accion="ingresarConOAuth"][data-args='["${proveedor}"]']`
    );

    if (boton?.dataset.configurado === "false") {
        mostrarErrorLogin(ERRORES_OAUTH.sin_configurar);
        return;
    }

    window.location.href = `${API}/api/auth/oauth/${encodeURIComponent(proveedor)}/iniciar`;
}

/**
 * Consulta al servidor qué proveedores OAuth están configurados y
 * desactiva los botones que no lo estén.
 *
 * @returns {Promise<void>}
 */
async function inicializarOAuth() {
    const botones = document.querySelectorAll(
        '.oauth-btn[data-accion="ingresarConOAuth"]'
    );

    try {
        const respuesta = await fetch(API + "/api/auth/oauth/proveedores");
        const datos = await respuesta.json();
        const estados = new Map(
            (datos.proveedores || []).map((item) => [item.id, item])
        );
        let hayDemo = false;

        botones.forEach(function (boton) {
            const id = JSON.parse(boton.dataset.args || "[]")[0];
            const info = estados.get(id);
            const configurado = info?.configurado === true;
            const demo = info?.demo === true;

            hayDemo = hayDemo || demo;
            boton.dataset.configurado = String(configurado);
            boton.dataset.demo = String(demo);
            boton.classList.toggle("no-configurado", !configurado);
            boton.classList.toggle("modo-demo", demo);

            if (!configurado) {
                boton.title = "Falta configurar las credenciales en el servidor";
            } else if (demo) {
                boton.title = "Modo demo local: usa un correo registrado en RunTrash";
            } else {
                boton.title = `Ingresar con ${id === "google" ? "Google" : "Outlook"}`;
            }
        });

        /*
        En modo demo se avisa en la nota para que nadie crea que el
        proveedor real está validando la identidad.
        */
        const nota = document.querySelector(".oauth-nota");

        if (nota && hayDemo) {
            nota.textContent = "Modo demo local: entra con un correo ya registrado en RunTrash. Los operarios usan sus dos códigos en el formulario.";
        }
    } catch (error) {
        console.warn("No se pudo consultar la configuración de OAuth:", error);
    }
}

/**
 * Completa el ingreso cuando el callback de OAuth devuelve un código de
 * un solo uso. Canjea el código, guarda la sesión y redirige al panel.
 *
 * @returns {Promise<void>}
 */
async function completarIngresoOAuth() {
    const parametros = new URLSearchParams(window.location.search);
    const codigo = parametros.get("oauth_codigo");
    const error = parametros.get("oauth_error");

    if (error) {
        mostrarErrorLogin(
            ERRORES_OAUTH[error] || ERRORES_OAUTH.fallo_proveedor
        );

        /*
        Se limpia la URL para que el mensaje no se repita al recargar y
        para no conservar el código de error en el historial.
        */
        window.history.replaceState({}, document.title, "index.html");
        return;
    }

    if (!codigo) return;

    window.history.replaceState({}, document.title, "index.html");

    try {
        const respuesta = await fetch(API + "/api/auth/oauth/canjear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codigo })
        });
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            mostrarErrorLogin(
                resultado.mensaje || ERRORES_OAUTH.fallo_proveedor
            );
            return;
        }

        localStorage.setItem("runtrash_user", JSON.stringify(resultado.usuario));
        localStorage.setItem("runtrash_token", resultado.token);

        if (!redirigirPorRol(resultado.usuario)) {
            mostrarErrorLogin(
                "Tu cuenta tiene un rol no habilitado para este acceso."
            );
        }
    } catch (error) {
        console.error("Error completando el ingreso OAuth:", error);
        mostrarErrorLogin("No se pudo completar el ingreso con el proveedor.");
    }
}
