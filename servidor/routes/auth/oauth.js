/**
 * @file Ingreso con Google y Microsoft/Outlook.
 *
 * Rutas del flujo OAuth 2.0:
 * - `GET /auth/oauth/proveedores` informa cuáles están configurados.
 * - `GET /auth/oauth/:proveedor/iniciar` redirige al proveedor con PKCE.
 * - `GET /auth/oauth/:proveedor/callback` valida la respuesta y entrega
 *   un código de un solo uso al frontend.
 * - `POST /auth/oauth/canjear` cambia ese código por el token real.
 *
 * El token de sesión nunca viaja en la URL. Solo se permite el ingreso
 * de cuentas ya registradas, activas y que no sean operarios.
 *
 * @module routes/auth/oauth
 */

const express = require('express');
const crypto = require('crypto');
const authRepo = require('../../repositories/auth');
const oauth = require('../../lib/oauth');
const { hashSessionToken } = require('../../lib/security');
const { authLimiter } = require('../../lib/limiters');
const { SESSION_HOURS, oauthBaseUrl } = require('../../config');

const router = express.Router();

/** Minutos de vigencia del código de un solo uso. */
const MINUTOS_CANJE = 2;

/**
 * Redirige al inicio con un código de error legible por el frontend.
 *
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {string} codigo - Clave del error (`sin_configurar`, ...).
 * @returns {void}
 */
function volverConError(res, codigo) {
    const destino = new URL('/index.html', `${oauthBaseUrl}/`);
    destino.searchParams.set('oauth_error', codigo);
    res.redirect(302, destino.toString());
}

/**
 * Indica si el retorno del proveedor es seguro. Evita redirecciones
 * abiertas: siempre se vuelve al origen configurado.
 *
 * @param {import('express').Request} req - Petición del callback.
 * @returns {boolean} `true` si el `code` es una cadena razonable.
 */
function codigoValido(req) {
    const codigo = String(req.query.code || '');
    return codigo.length > 0 && codigo.length <= 4096;
}

/**
 * Escapa texto para insertarlo en el HTML de la pantalla demo.
 *
 * @param {string} valor - Texto sin escapar.
 * @returns {string} Texto seguro para HTML.
 */
function escaparHtml(valor) {
    return String(valor).replace(/[&<>"']/g, (caracter) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[caracter]));
}

/**
 * Pantalla local que reemplaza al proveedor cuando `OAUTH_DEMO` está
 * activo. Permite probar el flujo sin credenciales de Google o Azure.
 *
 * @param {string} proveedor - `google` o `microsoft`.
 * @param {{correo?: string, error?: string}} [datos] - Valores previos.
 * @returns {string} Documento HTML.
 */
function paginaDemo(proveedor, datos = {}) {
    const nombre = oauth.listarProveedores()
        .find((item) => item.id === proveedor)?.nombre || proveedor;
    const correo = escaparHtml(datos.correo || '');
    const error = datos.error
        ? `<p class="demo-error" role="alert">${escaparHtml(datos.error)}</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ingreso demo con ${escaparHtml(nombre)} · RunTrash</title>
<style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
        display: grid;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        place-items: center;
        font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        background:
            radial-gradient(circle at 12% 8%, rgba(217, 247, 108, 0.35), transparent 34%),
            radial-gradient(circle at 88% 92%, rgba(32, 200, 117, 0.28), transparent 36%),
            linear-gradient(145deg, #042b18, #063b22 58%, #075a32);
    }
    .demo-card {
        width: min(460px, 100%);
        padding: 34px 32px 28px;
        background: #ffffff;
        border-radius: 24px;
        box-shadow: 0 32px 80px rgba(2, 26, 14, 0.35);
    }
    .demo-badge {
        display: inline-flex;
        padding: 5px 11px;
        color: #063b22;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        background: linear-gradient(135deg, #e3ff7e, #b9f0c9);
        border-radius: 999px;
    }
    h1 { margin: 18px 0 8px; color: #063b22; font-size: 25px; line-height: 1.2; }
    p { margin: 0 0 14px; color: #45604f; font-size: 14px; line-height: 1.6; }
    label { display: block; margin: 18px 0 7px; color: #063b22; font-size: 12px; font-weight: 800; }
    input {
        width: 100%;
        padding: 13px 14px;
        color: #063b22;
        font: inherit;
        background: #f3faf5;
        border: 1px solid #cfe6d7;
        border-radius: 13px;
    }
    input:focus { outline: 2px solid #29a566; outline-offset: 1px; background: #fff; }
    button {
        width: 100%;
        margin-top: 16px;
        padding: 14px;
        color: #042b18;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        background: linear-gradient(135deg, #d9f76c, #7ee2a8);
        border: 0;
        border-radius: 13px;
        box-shadow: 0 12px 24px rgba(41, 165, 102, 0.22);
    }
    button:hover { filter: brightness(1.03); }
    .demo-error {
        padding: 11px 13px;
        color: #8a1f1f;
        font-size: 13px;
        font-weight: 600;
        background: #fdecec;
        border: 1px solid #f5c2c2;
        border-radius: 11px;
    }
    .demo-nota { margin-top: 18px; font-size: 12px; }
    a { color: #087943; font-size: 12.5px; font-weight: 700; }
</style>
</head>
<body>
<main class="demo-card">
    <span class="demo-badge">Modo demo local</span>
    <h1>Ingresar con ${escaparHtml(nombre)}</h1>
    <p>
        Esta pantalla reemplaza la autorización real de ${escaparHtml(nombre)}
        mientras no haya credenciales configuradas. Escribe el correo de una
        cuenta <strong>ya registrada y activa</strong> en RunTrash.
    </p>
    ${error}
    <form method="post" action="/api/auth/oauth/${escaparHtml(proveedor)}/demo">
        <label for="correo">Correo registrado en RunTrash</label>
        <input
            id="correo"
            name="correo"
            type="email"
            autocomplete="email"
            maxlength="160"
            required
            value="${correo}"
            placeholder="tu@correo.com"
        >
        <button type="submit">Entrar como ${escaparHtml(nombre)}</button>
    </form>
    <p class="demo-nota">
        Los operarios deben entrar con el código del NIT y el código de
        verificación de su empresa desde el formulario normal.
    </p>
    <a href="/index.html">Volver al inicio de sesión</a>
</main>
</body>
</html>`;
}

/**
 * Crea el código de un solo uso y redirige al inicio para que el
 * frontend lo canjee por una sesión.
 *
 * @param {import('express').Response} res - Respuesta HTTP.
 * @param {{id: number}} usuario - Cuenta autenticada.
 * @returns {Promise<void>}
 */
async function entregarCodigoAcceso(res, usuario) {
    const codigo = crypto.randomBytes(32).toString('hex');

    await authRepo.crearCodigoOAuth(
        usuario.id,
        hashSessionToken(codigo),
        MINUTOS_CANJE
    );

    const destino = new URL('/index.html', `${oauthBaseUrl}/`);
    destino.searchParams.set('oauth_codigo', codigo);
    res.redirect(302, destino.toString());
}

/**
 * Lista los proveedores y si están listos para usarse.
 */
router.get('/auth/oauth/proveedores', (_req, res) => {
    res.json({
        ok: true,
        proveedores: oauth.listarProveedores()
    });
});

/**
 * Inicia el flujo de autorización con el proveedor elegido.
 */
router.get('/auth/oauth/:proveedor/iniciar', (req, res) => {
    const proveedor = String(req.params.proveedor || '').toLowerCase();

    if (!oauth.proveedorConfigurado(proveedor)) {
        return volverConError(res, 'sin_configurar');
    }

    /*
    Sin credenciales reales, el modo demo usa una pantalla local. Si
    existen credenciales, el flujo real tiene prioridad.
    */
    if (oauth.demoActivo() && !oauth.proveedorRealConfigurado(proveedor)) {
        return res.redirect(
            302,
            `/api/auth/oauth/${encodeURIComponent(proveedor)}/demo`
        );
    }

    const solicitud = oauth.crearSolicitud(proveedor);

    if (!solicitud) {
        return volverConError(res, 'sin_configurar');
    }

    res.setHeader('Set-Cookie', oauth.cookieSolicitud(proveedor, solicitud.cookie));
    res.redirect(302, solicitud.url);
});

/**
 * Pantalla local del modo demo (solo cuando `OAUTH_DEMO` está activo).
 */
router.get('/auth/oauth/:proveedor/demo', (req, res) => {
    const proveedor = String(req.params.proveedor || '').toLowerCase();

    if (
        !oauth.demoActivo()
        || !oauth.proveedorConfigurado(proveedor)
        || oauth.proveedorRealConfigurado(proveedor)
    ) {
        return volverConError(res, 'sin_configurar');
    }

    res.type('html').send(paginaDemo(proveedor));
});

/**
 * Procesa el correo escrito en la pantalla demo y entrega la sesión.
 */
router.post('/auth/oauth/:proveedor/demo', async (req, res) => {
    const proveedor = String(req.params.proveedor || '').toLowerCase();

    if (
        !oauth.demoActivo()
        || !oauth.proveedorConfigurado(proveedor)
        || oauth.proveedorRealConfigurado(proveedor)
    ) {
        return volverConError(res, 'sin_configurar');
    }

    const correo = String(req.body?.correo || '').trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return res.status(400).type('html').send(
            paginaDemo(proveedor, {
                correo,
                error: 'Escribe un correo válido.'
            })
        );
    }

    try {
        const usuario = await authRepo.buscarUsuarioLogin(correo);

        if (!usuario) {
            return res.status(404).type('html').send(
                paginaDemo(proveedor, {
                    correo,
                    error: 'Ese correo no está registrado en RunTrash.'
                })
            );
        }

        if (!usuario.activo) {
            return res.status(403).type('html').send(
                paginaDemo(proveedor, {
                    correo,
                    error: 'Esa cuenta está desactivada. Contacta al administrador.'
                })
            );
        }

        if (usuario.tipo_usuario === 'operario') {
            return res.status(403).type('html').send(
                paginaDemo(proveedor, {
                    correo,
                    error:
                        'Los operarios deben entrar con el código del NIT y el código de verificación de su empresa.'
                })
            );
        }

        await entregarCodigoAcceso(res, usuario);
    } catch (error) {
        console.error('ERROR EN OAUTH DEMO:', error);
        volverConError(res, 'fallo_proveedor');
    }
});

/**
 * Recibe la respuesta del proveedor y crea la sesión de RunTrash.
 */
router.get('/auth/oauth/:proveedor/callback', async (req, res) => {
    const proveedor = String(req.params.proveedor || '').toLowerCase();

    try {
        if (!oauth.proveedorConfigurado(proveedor)) {
            return volverConError(res, 'sin_configurar');
        }

        if (req.query.error) {
            return volverConError(res, 'cancelado');
        }

        if (!codigoValido(req)) {
            return volverConError(res, 'respuesta_invalida');
        }

        const solicitud = oauth.validarSolicitud(
            proveedor,
            req,
            String(req.query.state || '')
        );

        if (!solicitud) {
            return volverConError(res, 'estado_invalido');
        }

        res.setHeader('Set-Cookie', oauth.cookieBorrar(proveedor));

        const tokenProveedor = await oauth.intercambiarCodigo(
            proveedor,
            String(req.query.code),
            solicitud.verificador
        );
        const identidad = await oauth.obtenerIdentidad(
            proveedor,
            tokenProveedor
        );

        if (!identidad.verificado) {
            return volverConError(res, 'correo_no_verificado');
        }

        const usuario = await authRepo.buscarUsuarioLogin(identidad.correo);

        if (!usuario) {
            return volverConError(res, 'cuenta_no_registrada');
        }

        if (!usuario.activo) {
            return volverConError(res, 'cuenta_inactiva');
        }

        /*
        Los operarios deben ingresar con sus dos códigos: el del NIT y
        el que entrega su empresa. OAuth no reemplaza ese control.
        */
        if (usuario.tipo_usuario === 'operario') {
            return volverConError(res, 'operario_con_codigos');
        }

        /*
        Se entrega un código de un solo uso en lugar del token. Así el
        token no queda en el historial, en los logs ni en un enlace
        compartido. El frontend lo canjea de inmediato.
        */
        await entregarCodigoAcceso(res, usuario);
    } catch (error) {
        console.error('ERROR EN OAUTH:', error);
        volverConError(res, 'fallo_proveedor');
    }
});

/**
 * Canjea el código de un solo uso por el token de sesión.
 */
router.post('/auth/oauth/canjear', authLimiter, async (req, res) => {
    try {
        const codigo = String(req.body?.codigo || '').trim();

        if (!codigo || codigo.length > 256) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Código de acceso no válido.'
            });
        }

        const usuario = await authRepo.canjearCodigoOAuth(
            hashSessionToken(codigo)
        );

        if (!usuario || !usuario.activo) {
            return res.status(401).json({
                ok: false,
                mensaje:
                    'El enlace de acceso expiró. Vuelve a intentar con Google u Outlook.'
            });
        }

        if (usuario.tipo_usuario === 'operario') {
            return res.status(403).json({
                ok: false,
                mensaje:
                    'Los operarios deben ingresar con sus códigos de verificación.'
            });
        }

        await authRepo.limpiarIntentos(usuario.id);

        const token = crypto.randomBytes(48).toString('hex');

        await authRepo.crearSesion(
            usuario.id,
            hashSessionToken(token),
            SESSION_HOURS
        );

        const publico = { ...usuario };
        delete publico.password;

        res.json({
            ok: true,
            mensaje: 'Inicio de sesión correcto.',
            usuario: publico,
            token
        });
    } catch (error) {
        console.error('ERROR AL CANJEAR OAUTH:', error);
        res.status(500).json({
            ok: false,
            mensaje: 'No se pudo completar el ingreso.'
        });
    }
});

module.exports = router;
