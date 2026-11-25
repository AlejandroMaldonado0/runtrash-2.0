/**
 * @file Gestión de usuarios del panel administrador.
 *
 * Crea, edita, activa y restablece contraseñas de las cuentas de la
 * plataforma.
 *
 * @module frontend/pages/admin/usuarios
 */

/**
 * Activa o desactiva una cuenta y recarga la tabla.
 *
 * @param {number} id - Identificador del usuario.
 * @param {boolean} active - Estado actual (se invierte).
 * @returns {Promise<void>}
 */
async function alternarUsuario(id, active) {
    try {
        await apiFetch(`${API}/api/admin/usuarios/${id}/estado`, {
            method: "PATCH",
            body: JSON.stringify({ activo: !active })
        });
        await cargarTodo();
        mostrarToast(!active ? "Usuario activado." : "Usuario desactivado.");
    } catch (error) { mostrarToast(error.message); }
}

/**
 * Abre el modal de alta con el formulario vacío y los campos por rol.
 *
 * @returns {void}
 */
function abrirCrearUsuario() {
    editingUserId = null;
    document.getElementById("adminModalTitle").textContent = "Crear usuario";
    document.getElementById("adminModalCard").classList.add("modal-card-wide");
    document.getElementById("adminModalContent").innerHTML = `
        <div class="input-group"><label for="nuevoUsuarioNombre">Nombre completo</label><input id="nuevoUsuarioNombre" autocomplete="name"></div>
        <div class="input-group"><label for="nuevoUsuarioCorreo">Correo</label><input id="nuevoUsuarioCorreo" type="email" autocomplete="email"></div>
        <div class="input-group"><label for="nuevoUsuarioPassword">Contraseña temporal</label><div class="password-field"><input id="nuevoUsuarioPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres, con letras y números"><button type="button" class="password-toggle" data-accion="togglePassword" data-target="nuevoUsuarioPassword" aria-label="Mostrar contraseña"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="6.5"/><circle cx="12" cy="12" r="2.8"/></svg></button></div></div>
        <div class="input-group"><label for="nuevoUsuarioRol">Rol</label><select id="nuevoUsuarioRol" data-accion="cambiarCamposUsuarioAdmin"><option value="ciudadano">Ciudadano</option><option value="operario">Operario</option><option value="empresa">Empresa</option><option value="distrito">Distrito</option><option value="policia">Policía</option><option value="sspd">SSPD</option></select></div>
        <div class="admin-extra-fields" id="adminCamposOperador" hidden><div class="input-group"><label for="nuevoUsuarioZona">Localidad asignada</label><select id="nuevoUsuarioZona"><option value="">Selecciona</option>${features.localidades.map((item) => `<option>${item}</option>`).join("")}</select></div></div>
        <div class="input-group" id="adminCampoNit" hidden><label for="nuevoUsuarioNit">NIT de la empresa</label><input id="nuevoUsuarioNit" placeholder="Ej: 900123456-7"><small>El código de operario son los últimos 4 dígitos del NIT.</small></div>
        <button class="admin-primary-button full-admin-button" type="button" data-accion="crearUsuarioAdmin">Crear usuario</button>`;
    document.getElementById("adminModal").classList.add("show");
}

/**
 * Abre el modal de edición precargado con los datos del usuario.
 *
 * @param {number} id - Identificador del usuario.
 * @returns {void}
 */
function editarUsuarioAdmin(id) {
    const user = usuarios.find((item) => item.id === id);
    if (!user) return;
    abrirCrearUsuario();
    editingUserId = id;
    document.getElementById("adminModalTitle").textContent = "Editar usuario";
    document.getElementById("nuevoUsuarioNombre").value = user.nombre;
    document.getElementById("nuevoUsuarioCorreo").value = user.correo;
    document.getElementById("nuevoUsuarioPassword").value = "";
    document.getElementById("nuevoUsuarioPassword").placeholder = "No es necesaria para editar";
    document.getElementById("nuevoUsuarioRol").value = user.tipo_usuario;
    document.getElementById("nuevoUsuarioZona").value = user.zona_asignada || "";
    document.getElementById("nuevoUsuarioNit").value = user.empresa_nit || user.nit_empresa || "";
    cambiarCamposUsuarioAdmin();
}

/**
 * Abre el modal para asignar una contraseña temporal a un usuario.
 *
 * @param {number} id - Identificador del usuario.
 * @returns {void}
 */
function restablecerPasswordAdmin(id) {
    const user = usuarios.find((item) => item.id === id);
    if (!user) return;
    document.getElementById("adminModalTitle").textContent = "Restablecer contraseña";
    document.getElementById("adminModalContent").innerHTML = `<div class="form-intro"><span>🔐</span><p>Se cerrarán las sesiones activas de <strong>${features.escapeHTML(user.nombre)}</strong>.</p></div><div class="input-group"><label for="passwordAdminTemporal">Contraseña nueva</label><div class="password-field"><input id="passwordAdminTemporal" type="password" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres, con letras y números"><button type="button" class="password-toggle" data-accion="togglePassword" data-target="passwordAdminTemporal" aria-label="Mostrar contraseña"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="6.5"/><circle cx="12" cy="12" r="2.8"/></svg></button></div></div><button class="admin-primary-button full-admin-button" type="button" data-accion="enviarPasswordAdmin" data-args='[${Number(id)}]'>Actualizar contraseña</button>`;
    document.getElementById("adminModal").classList.add("show");
}

/**
 * Envía la nueva contraseña a la API y cierra el modal.
 *
 * @param {number} id - Identificador del usuario.
 * @returns {Promise<void>}
 */
async function enviarPasswordAdmin(id) {
    const password = document.getElementById("passwordAdminTemporal").value;
    try {
        await apiFetch(`${API}/api/admin/usuarios/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) });
        cerrarModal();
        mostrarToast("Contraseña actualizada.");
    } catch (error) { mostrarToast(error.message); }
}

/**
 * Muestra u oculta los campos exclusivos de operario y empresa según
 * el rol elegido.
 *
 * @returns {void}
 */
function cambiarCamposUsuarioAdmin() {
    const role = document.getElementById("nuevoUsuarioRol").value;
    document.getElementById("adminCamposOperador").hidden = role !== "operario";
    document.getElementById("adminCampoNit").hidden = !["operario", "empresa"].includes(role);
}

/**
 * Muestra una sola vez el código de verificación generado para un
 * operario.
 *
 * @param {string} nombre - Nombre del operario.
 * @param {string} codigo - Código de seis dígitos.
 * @returns {void}
 */
function mostrarCodigoVerificacionAdmin(nombre, codigo) {
    document.getElementById("adminModalCard").classList.remove("modal-card-wide");
    document.getElementById("adminModalTitle").textContent =
        "Código de verificación";
    document.getElementById("adminModalContent").innerHTML = `
        <div class="team-code-result">
            <p>Entrega este código a <strong>${features.escapeHTML(nombre)}</strong>. No se volverá a mostrar.</p>
            <code class="team-code-value">${features.escapeHTML(codigo)}</code>
            <p class="inline-warning">El operario lo necesita junto a los últimos 4 dígitos del NIT de su empresa. Si lo pierde, genera uno nuevo.</p>
            <button class="admin-primary-button full-admin-button" type="button" data-accion="cerrarModal">Entendido</button>
        </div>`;
    document.getElementById("adminModal").classList.add("show");
}

/**
 * Genera o rota el código de verificación de un operario.
 *
 * @param {number} id - Identificador del usuario.
 * @returns {Promise<void>}
 */
async function generarCodigoUsuarioAdmin(id) {
    const user = usuarios.find((item) => item.id === id);

    try {
        const resultado = await apiFetch(
            `${API}/api/admin/usuarios/${id}/codigo-verificacion`,
            { method: "POST" }
        );

        await cargarTodo();
        mostrarCodigoVerificacionAdmin(
            user?.nombre || "el operario",
            resultado.codigo_verificacion
        );
    } catch (error) {
        mostrarToast(error.message);
    }
}

/**
 * Crea o actualiza un usuario según `editingUserId`.
 *
 * @returns {Promise<void>}
 */
async function crearUsuarioAdmin() {
    const role = document.getElementById("nuevoUsuarioRol").value;
    const body = {
        nombre: document.getElementById("nuevoUsuarioNombre").value.trim(),
        correo: document.getElementById("nuevoUsuarioCorreo").value.trim(),
        password: document.getElementById("nuevoUsuarioPassword").value,
        tipo_usuario: role,
        zona_asignada: document.getElementById("nuevoUsuarioZona")?.value || null,
        nit_empresa: document.getElementById("nuevoUsuarioNit")?.value.trim() || null
    };
    const usuario = usuarios.find((item) => item.id === editingUserId);

    if (usuario?.empresa_id && !body.empresa_id) {
        body.empresa_id = usuario.empresa_id;
    }

    try {
        const endpoint = editingUserId
            ? `${API}/api/admin/usuarios/${editingUserId}`
            : `${API}/api/admin/usuarios`;
        const method = editingUserId ? "PUT" : "POST";

        /*
        `apiFetch` del panel ya devuelve el cuerpo JSON y lanza un error
        legible cuando la API responde 401/403 o un código de error.
        */
        const resultado = await apiFetch(
            endpoint,
            { method, body: JSON.stringify(body) }
        );

        cerrarModal();
        await cargarTodo();

        /*
        El código de verificación del operario se devuelve solo en el
        alta. Se muestra una vez para que el administrador lo entregue.
        */
        if (!editingUserId && resultado.codigo_verificacion) {
            mostrarCodigoVerificacionAdmin(
                resultado.usuario?.nombre || body.nombre,
                resultado.codigo_verificacion
            );
            return;
        }

        mostrarToast(editingUserId ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
    } catch (error) { mostrarToast(error.message); }
}
