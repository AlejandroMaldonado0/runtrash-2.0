/**
 * @file Verificación de interfaz con Chrome DevTools Protocol.
 *
 * Comprueba, sin dependencias externas, que las seis páginas carguen sin
 * errores de consola ni violaciones de CSP y que las acciones
 * `data-accion` respondan a clics reales.
 *
 * Requisitos:
 * - El servidor debe estar en marcha (`npm start`).
 * - Chrome o Edge instalado (o definir `CHROME_PATH`).
 *
 * Uso:
 *   node scripts/verificar-ui.mjs
 *
 * La primera ejecución registra cuentas desechables `ui.*@runtrash.test`
 * para probar los paneles de ciudadano, empresa y operario.
 *
 * @module scripts/verificar-ui
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.RUNTRASH_URL || 'http://localhost:3000';
const PUERTO_CDP = Number(process.env.CDP_PORT || 9223);
const DIR_UPLOADS = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'uploads'
);

const CANDIDATOS_CHROME = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const CHROME = CANDIDATOS_CHROME.find((ruta) => fs.existsSync(ruta));

if (!CHROME) {
    console.error('No se encontró Chrome ni Edge. Define CHROME_PATH.');
    process.exit(1);
}

const PERFIL = fs.mkdtempSync(path.join(os.tmpdir(), 'runtrash-cdp-'));
/**
 * Espera un número de milisegundos.
 *
 * @param {number} ms - Tiempo de espera.
 * @returns {Promise<void>}
 */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Espera a que Chrome abra el puerto de depuración.
 *
 * @returns {Promise<object>} Información del navegador.
 */
async function esperarCdp() {
    for (let intento = 0; intento < 40; intento += 1) {
        try {
            const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`);
            if (respuesta.ok) return respuesta.json();
        } catch {
            // Todavía no está listo.
        }
        await esperar(250);
    }
    throw new Error('Chrome no abrió el puerto de depuración');
}

/** Sesión CDP mínima: envía comandos y acumula errores de la página. */
class Sesion {
    /**
     * @param {WebSocket} ws - Conexión al destino de depuración.
     */
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pendientes = new Map();
        this.eventos = [];
        this.errores = [];

        ws.addEventListener('message', (mensaje) => {
            const datos = JSON.parse(mensaje.data);

            if (datos.id && this.pendientes.has(datos.id)) {
                const { resolver, rechazar } = this.pendientes.get(datos.id);
                this.pendientes.delete(datos.id);
                if (datos.error) rechazar(new Error(datos.error.message));
                else resolver(datos.result);
                return;
            }

            this.eventos.push(datos);

            if (datos.method === 'Runtime.exceptionThrown') {
                const detalle = datos.params.exceptionDetails;
                this.errores.push(`Excepción: ${detalle.text} ${detalle.exception?.description || ''}`);
            }

            if (datos.method === 'Log.entryAdded' && datos.params.entry.level === 'error') {
                this.errores.push(`Log: ${datos.params.entry.text} ${datos.params.entry.url || ''}`);
            }

            if (datos.method === 'Runtime.consoleAPICalled' && datos.params.type === 'error') {
                this.errores.push(`Console: ${datos.params.args.map((a) => a.value ?? a.description).join(' ')}`);
            }
        });
    }

    /**
     * Envía un comando CDP y espera su resultado.
     *
     * @param {string} metodo - Nombre del comando (`Page.navigate`, ...).
     * @param {object} [params={}] - Parámetros del comando.
     * @returns {Promise<object>} Resultado devuelto por Chrome.
     */
    enviar(metodo, params = {}) {
        this.id += 1;
        const id = this.id;
        return new Promise((resolver, rechazar) => {
            this.pendientes.set(id, { resolver, rechazar });
            this.ws.send(JSON.stringify({ id, method: metodo, params }));
        });
    }

    async evaluar(expresion) {
        const resultado = await this.enviar('Runtime.evaluate', {
            expression: expresion,
            awaitPromise: true,
            returnByValue: true
        });

        if (resultado.exceptionDetails) {
            throw new Error(resultado.exceptionDetails.exception?.description || resultado.exceptionDetails.text);
        }

        return resultado.result.value;
    }
}

/**
 * Abre una pestaña nueva y activa los dominios necesarios.
 *
 * @returns {Promise<{sesion: Sesion, ws: WebSocket}>} Pestaña lista.
 */
async function abrirPestana() {
    const respuesta = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/new?about:blank`, { method: 'PUT' });
    const destino = await respuesta.json();
    const ws = new WebSocket(destino.webSocketDebuggerUrl);

    await new Promise((resolver, rechazar) => {
        ws.addEventListener('open', resolver, { once: true });
        ws.addEventListener('error', rechazar, { once: true });
    });

    const sesion = new Sesion(ws);
    await sesion.enviar('Runtime.enable');
    await sesion.enviar('Log.enable');
    await sesion.enviar('Page.enable');
    return { sesion, ws };
}

/**
 * Navega y espera el evento de carga más un margen para las peticiones.
 *
 * @param {Sesion} sesion - Sesión CDP.
 * @param {string} url - Destino.
 * @returns {Promise<void>}
 */
async function navegar(sesion, url) {
    const carga = new Promise((resolver) => {
        const intervalo = setInterval(() => {
            const evento = sesion.eventos.find((item) => item.method === 'Page.loadEventFired');
            if (evento) {
                clearInterval(intervalo);
                sesion.eventos = sesion.eventos.filter((item) => item.method !== 'Page.loadEventFired');
                resolver();
            }
        }, 50);

        setTimeout(() => {
            clearInterval(intervalo);
            resolver();
        }, 15000);
    });

    await sesion.enviar('Page.navigate', { url });
    await carga;
    await esperar(1500);
}

/**
 * Inicia sesión contra la API.
 *
 * @param {string} correo - Correo.
 * @param {string} password - Contraseña.
 * @param {object} [extra] - Campos adicionales (NIT, código de operario).
 * @returns {Promise<object>} Respuesta con token y usuario.
 */
async function iniciarSesion(correo, password, extra = {}) {
    const respuesta = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, password, ...extra })
    });
    const cuerpo = await respuesta.json();

    if (!cuerpo.token) {
        throw new Error(`No se pudo iniciar sesión como ${correo}: ${JSON.stringify(cuerpo)}`);
    }

    return cuerpo;
}

/**
 * Guarda la sesión en localStorage y abre el panel indicado.
 *
 * @param {Sesion} sesion - Sesión CDP.
 * @param {object} sesionApi - Resultado de `iniciarSesion`.
 * @param {string} destino - Página del panel.
 * @returns {Promise<void>}
 */
async function prepararAlmacen(sesion, sesionApi, destino) {
    await navegar(sesion, `${BASE}/index.html`);
    await sesion.evaluar(`
        localStorage.setItem("runtrash_user", ${JSON.stringify(JSON.stringify(sesionApi.usuario))});
        localStorage.setItem("runtrash_token", ${JSON.stringify(sesionApi.token)});
        "ok";
    `);
    await navegar(sesion, `${BASE}/${destino}`);
}

/**
 * Crea una cuenta privilegiada desde el panel administrador.
 *
 * El autorregistro solo acepta ciudadanos, así que empresa y operario se
 * crean (o actualizan) con el token del administrador. El código de
 * operario no se envía: el servidor lo deriva del NIT de la empresa.
 *
 * @param {object} datos - Datos de la cuenta.
 * @param {object} admin - Sesión de API del administrador.
 * @param {object} credenciales - Campos del segundo factor para el login.
 * @returns {Promise<object>} Sesión de API de la cuenta.
 */
async function asegurarCuentaPrivilegiada(datos, admin, credenciales) {
    const cabeceras = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`
    };
    const listado = await fetch(`${BASE}/api/admin/usuarios`, {
        headers: cabeceras
    });
    const { usuarios = [] } = await listado.json();
    const existente = usuarios.find(
        (usuario) => usuario.correo.toLowerCase() === datos.correo.toLowerCase()
    );

    const cuerpo = {
        nombre: datos.nombre,
        correo: datos.correo,
        tipo_usuario: datos.tipo_usuario,
        zona_asignada: datos.zona_asignada || null,
        nit_empresa: datos.nit_empresa || null
    };

    let respuesta;

    if (existente) {
        respuesta = await fetch(`${BASE}/api/admin/usuarios/${existente.id}`, {
            method: 'PUT',
            headers: cabeceras,
            body: JSON.stringify(cuerpo)
        });
    } else {
        respuesta = await fetch(`${BASE}/api/admin/usuarios`, {
            method: 'POST',
            headers: cabeceras,
            body: JSON.stringify({ ...cuerpo, password: datos.password })
        });
    }

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(
            `No se pudo preparar ${datos.tipo_usuario}: ${JSON.stringify(resultado)}`
        );
    }

    /*
    Si la cuenta ya existía, se fija la contraseña de prueba para que la
    verificación sea repetible aunque alguien la haya cambiado.
    */
    if (existente) {
        const password = await fetch(
            `${BASE}/api/admin/usuarios/${existente.id}/password`,
            {
                method: 'PUT',
                headers: cabeceras,
                body: JSON.stringify({ password: datos.password })
            }
        );

        if (!password.ok) {
            throw new Error(
                `No se pudo fijar la contraseña de ${datos.correo}: `
                + JSON.stringify(await password.json())
            );
        }
    }

    /*
    Los operarios necesitan además el código que entrega la empresa.
    Se genera con el token del administrador para que la prueba sea
    repetible aunque una ejecución anterior haya rotado el código.
    */
    if (datos.tipo_usuario === 'operario') {
        const operarioId = existente?.id || resultado.usuario?.id;
        const generacion = await fetch(
            `${BASE}/api/admin/usuarios/${operarioId}/codigo-verificacion`,
            { method: 'POST', headers: cabeceras }
        );
        const codigo = await generacion.json();

        if (!generacion.ok || !codigo.codigo_verificacion) {
            throw new Error(
                `No se pudo generar el código del operario: `
                + JSON.stringify(codigo)
            );
        }

        return iniciarSesion(datos.correo, datos.password, {
            ...credenciales,
            codigo_verificacion: codigo.codigo_verificacion
        });
    }

    return iniciarSesion(datos.correo, datos.password, credenciales);
}

/**
 * Crea la cuenta si no existe y devuelve su sesión.
 *
 * @param {object} datos - Datos de la cuenta.
 * @param {object} admin - Sesión de API del administrador.
 * @returns {Promise<object>} Sesión de API.
 */
async function asegurarCuenta(datos, admin) {
    const credenciales = {
        tipo_usuario: datos.tipo_usuario,
        nit_empresa: datos.nit_empresa,
        codigo_operario: datos.codigo_operario
    };

    try {
        return await iniciarSesion(datos.correo, datos.password, credenciales);
    } catch {
        // La cuenta aún no existe o sus datos cambiaron.
    }

    if (datos.tipo_usuario === 'ciudadano') {
        const respuesta = await fetch(`${BASE}/api/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const cuerpo = await respuesta.json();

        if (!respuesta.ok && respuesta.status !== 409) {
            throw new Error(`No se pudo crear el ciudadano: ${JSON.stringify(cuerpo)}`);
        }

        return iniciarSesion(datos.correo, datos.password, credenciales);
    }

    return asegurarCuentaPrivilegiada(datos, admin, credenciales);
}

const resultados = [];

/**
 * Guarda el resultado de una comprobación para la tabla final.
 *
 * @param {string} nombre - Nombre de la comprobación.
 * @param {boolean} ok - Resultado.
 * @param {string} [detalle=''] - Información adicional.
 * @returns {void}
 */
const registrar = (nombre, ok, detalle = '') => resultados.push({ nombre, ok, detalle });

const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PUERTO_CDP}`,
    `--user-data-dir=${PERFIL}`,
    '--window-size=1440,1000',
    'about:blank'
], { stdio: 'ignore' });

try {
    await esperarCdp();

    const admin = await iniciarSesion('admin.prueba@runtrash.test', 'Admin2026!');
    const distrito = await iniciarSesion('distrito@runtrash.test', 'RunTrash2026!');

    // ---------- Página pública ----------
    {
        const { sesion } = await abrirPestana();
        await navegar(sesion, `${BASE}/index.html`);
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const botonesTipo = [...document.querySelectorAll('#modalRegistro .tipo-btn')];
            pasos.push(["solo registro de ciudadano", botonesTipo.length === 1 && botonesTipo[0].dataset.tipo === "ciudadano"]);
            const accesos = [...document.querySelectorAll('#loginForm .acceso-btn')].map((b) => b.dataset.acceso);
            pasos.push([
                "login con dos accesos: ciudadano y organización",
                accesos.length === 2
                    && accesos.includes("ciudadano")
                    && accesos.includes("organizacion")
            ]);
            const botonOrganizacion = document.querySelector('#loginForm .acceso-btn[data-acceso="organizacion"]');
            botonOrganizacion?.click();
            await pausa(150);
            const rolesLogin = [...document.querySelectorAll('#loginForm .tipo-btn')].map((b) => b.dataset.tipo);
            pasos.push([
                "el acceso de organización despliega los roles sin administrador",
                !document.getElementById("panelRoles")?.hidden
                    && ["operario", "empresa", "distrito", "policia", "sspd"]
                        .every((rol) => rolesLogin.includes(rol))
                    && !rolesLogin.includes("ciudadano")
                    && !rolesLogin.includes("admin")
            ]);
            pasos.push([
                "cada rol muestra su emoji",
                [...document.querySelectorAll('#loginForm .tipo-btn')].every((boton) => {
                    const contenido = getComputedStyle(boton, "::before").content;
                    return /[\\p{Extended_Pictographic}]/u.test(contenido);
                })
            ]);
            pasos.push([
                "el panel de administrador no está enlazado en el login",
                document.querySelectorAll('a[href*="admin"]').length === 0
            ]);
            document.querySelector('#loginForm .tipo-btn[data-tipo="distrito"]')?.click();
            await pausa(150);
            pasos.push([
                "distrito sin campos de operario ni empresa",
                !document.getElementById("campoOperarioLogin")?.classList.contains("visible")
                    && !document.getElementById("campoVerificacionLogin")?.classList.contains("visible")
                    && !document.getElementById("campoEmpresaLogin")?.classList.contains("visible")
                    && document.getElementById("codigoOperarioLogin")?.required === false
                    && document.getElementById("nitEmpresaLogin")?.required === false
            ]);
            document.querySelector('#loginForm .tipo-btn[data-tipo="operario"]')?.click();
            await pausa(150);
            pasos.push([
                "operario muestra el código del NIT y el de la empresa",
                document.getElementById("campoOperarioLogin")?.classList.contains("visible")
                    && document.getElementById("campoVerificacionLogin")?.classList.contains("visible")
                    && document.getElementById("codigoOperarioLogin")?.required === true
                    && document.getElementById("codigoVerificacionLogin")?.required === true
            ]);
            pasos.push([
                "botones de Google y Outlook presentes",
                document.querySelectorAll('.oauth-btn[data-accion="ingresarConOAuth"]').length === 2
            ]);
            document.querySelector('[data-accion="abrirRegistro"]')?.click();
            await pausa(150);
            pasos.push(["registro visible", document.getElementById("modalRegistro")?.classList.contains("active")]);
            document.querySelector('[data-accion="cerrarRegistro"]')?.click();
            await pausa(150);
            pasos.push(["registro cerrado", !document.getElementById("modalRegistro")?.classList.contains("active")]);
            document.querySelector('[data-accion="abrirRecuperacion"]')?.click();
            await pausa(150);
            pasos.push(["recuperacion visible", Boolean(document.querySelector(".recuperacion-box, .modal.show"))]);
            document.querySelector('[data-accion="cerrarRecuperacion"]')?.click();
            return pasos;
        })()`);
        registrar('index.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        registrar('index.html sin errores', sesion.errores.length === 0, sesion.errores.join(' | '));
    }

    // ---------- Admin ----------
    {
        const { sesion } = await abrirPestana();
        await prepararAlmacen(sesion, admin, 'admin.html');
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const enlaces = [...document.querySelectorAll('.menu a[data-accion="irA"]')];
            enlaces[2]?.click();
            await pausa(200);
            pasos.push(["menú admin", enlaces.length >= 3 && enlaces[2].classList.contains("active")]);
            document.querySelector('[data-accion="mostrarNotificaciones"]')?.click();
            await pausa(500);
            pasos.push(["modal notificaciones", Boolean(document.querySelector(".modal.show"))]);
            document.querySelector('.modal.show .close')?.click();
            await pausa(150);
            pasos.push(["modal cerrado", !document.querySelector(".modal.show")]);
            document.querySelectorAll('.menu a[data-accion="irA"]')[1]?.click();
            await pausa(300);
            document.querySelector('[data-accion="generarCodigoUsuarioAdmin"]')?.click();
            await pausa(1200);
            const codigoAdmin = document.querySelector('.team-code-value')?.textContent?.trim() || '';
            pasos.push([
                "código de operario visible en admin",
                /^\\d{6}$/.test(codigoAdmin)
                    && Boolean(document.getElementById("adminModal")?.classList.contains("show"))
            ]);
            document.querySelector('#adminModal [data-accion="cerrarModal"]')?.click();
            await pausa(150);
            return pasos;
        })()`);
        registrar('admin.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        registrar('admin.html sin errores', sesion.errores.length === 0, sesion.errores.join(' | '));
    }

    // ---------- Control ----------
    {
        /*
        Se elige un reporte cuya imagen exista en disco para que abrir el
        detalle no genere un 404 de archivo de demostración ausente.
        */
        const listadoControl = await fetch(`${BASE}/api/control/reportes`, {
            headers: { Authorization: `Bearer ${distrito.token}` }
        }).then((respuesta) => respuesta.json()).catch(() => ({}));

        const reporteMostrable = (listadoControl.reportes || []).find((reporte) => {
            if (!reporte.imagen_url) return true;
            const clave = reporte.imagen_url.replace(/^\/uploads\//, '');
            return fs.existsSync(path.join(DIR_UPLOADS, clave));
        });

        const { sesion } = await abrirPestana();
        await prepararAlmacen(sesion, distrito, 'control.html');
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const enlaces = [...document.querySelectorAll('.menu a[data-accion="irA"]')];
            enlaces[1]?.click();
            await pausa(200);
            pasos.push(["menú control", enlaces.length >= 2 && enlaces[1].classList.contains("active")]);
            document.querySelector('[data-accion="mostrarNotificaciones"]')?.click();
            await pausa(600);
            const abrio = Boolean(document.querySelector("#controlModal.show"));
            const aviso = document.getElementById("toast")?.classList.contains("show");
            pasos.push(["notificaciones (modal o aviso)", abrio || Boolean(aviso)]);
            document.querySelector('#controlModal [data-accion="cerrarModal"]')?.click();
            await pausa(150);
            pasos.push(["modal cerrado", !document.querySelector("#controlModal.show")]);
            document.querySelector('#controlFiltros button[type="submit"]')?.click();
            await pausa(400);
            pasos.push(["filtros enviados", true]);
            pasos.push([
                "columna de seguimientos propios",
                document.getElementById("controlSeguimientosTh")?.textContent === "Mis seguimientos"
            ]);
            if (${Boolean(reporteMostrable)}) {
                await verReporte(${Number(reporteMostrable?.id || 0)});
                await pausa(500);
                const modalDetalle = document.getElementById("controlModal");
                pasos.push([
                    "detalle con historial aislado",
                    Boolean(modalDetalle?.classList.contains("show"))
                        && modalDetalle.textContent.includes(
                            "Solo se muestran los seguimientos registrados por tu ente."
                        )
                ]);
                document.querySelector('#controlModal [data-accion="cerrarModal"]')?.click();
                await pausa(150);
            } else {
                pasos.push(["detalle con historial aislado", true]);
            }
            return pasos;
        })()`);
        registrar('control.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        registrar('control.html sin errores', sesion.errores.length === 0, sesion.errores.join(' | '));
    }

    // ---------- Cuentas desechables ----------
    const cuentas = {};

    cuentas.ciudadano = await asegurarCuenta({
        nombre: 'UI Ciudadano',
        correo: 'ui.ciudadano@runtrash.test',
        password: 'UiTest2026!',
        tipo_usuario: 'ciudadano'
    }, admin);

    cuentas.empresa = await asegurarCuenta({
        nombre: 'UI Empresa',
        correo: 'ui.empresa@runtrash.test',
        password: 'UiTest2026!',
        tipo_usuario: 'empresa',
        nit_empresa: '900123456-7'
    }, admin);

    cuentas.operario = await asegurarCuenta({
        nombre: 'UI Operario',
        correo: 'ui.operario@runtrash.test',
        password: 'UiTest2026!',
        tipo_usuario: 'operario',
        nit_empresa: '900123456-7',
        codigo_operario: '4567',
        zona_asignada: 'Usaquén'
    }, admin);

    // ---------- Ciudadano ----------
    {
        const { sesion } = await abrirPestana();
        await prepararAlmacen(sesion, cuentas.ciudadano, 'ciudadano.html');
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const enlace = document.querySelector('.menu a[data-accion="irAReportes"]');
            enlace?.click();
            await pausa(200);
            pasos.push(["menú reportes", Boolean(enlace?.classList.contains("active"))]);
            document.querySelector('[data-accion="abrirNuevoReporte"]')?.click();
            await pausa(300);
            pasos.push(["modal reporte", document.getElementById("modal")?.classList.contains("show")]);
            document.querySelector('#modal [data-accion="cerrarModal"]')?.click();
            await pausa(200);
            pasos.push(["modal cerrado", !document.getElementById("modal")?.classList.contains("show")]);
            document.querySelector('[data-accion="mostrarNotificaciones"]')?.click();
            await pausa(600);
            pasos.push(["notificaciones o aviso", Boolean(document.getElementById("modal")?.classList.contains("show")) || document.getElementById("toast")?.classList.contains("show")]);
            document.querySelector('#modal [data-accion="cerrarModal"]')?.click();
            document.querySelector('[data-accion="mostrarPerfil"]')?.click();
            await pausa(900);
            pasos.push(["perfil", Boolean(document.getElementById("modal")?.classList.contains("show"))]);
            pasos.push([
                "perfil didáctico con rol, guía y datos",
                /[\\p{Extended_Pictographic}]/u.test(
                    document.querySelector("#modal .perfil-rol-chip")?.textContent || ""
                )
                    && document.querySelector("#modal")?.textContent.includes("Tu rol en 3 pasos")
                    && document.querySelectorAll("#modal .perfil-dato").length >= 2
            ]);
            pasos.push([
                "perfil en español",
                document.querySelector("#modal")?.textContent.includes("Miembro desde")
                    && !document.querySelector("#modal")?.textContent.includes("Member since")
            ]);
            const resumenPerfil = document.querySelector("#modal [data-perfil-resumen]");
            const tabsPerfil = [...document.querySelectorAll("#modal [data-perfil-tab]")];
            pasos.push([
                "cuadro de resumen con pestañas",
                Boolean(resumenPerfil)
                    && ["resumen", "pendiente", "en proceso", "completado"]
                        .every((clave) => tabsPerfil.some((tab) => tab.dataset.perfilTab === clave))
            ]);
            pasos.push([
                "conteos del resumen",
                [...document.querySelectorAll("#modal [data-perfil-count]")]
                    .every((nodo) => /^\\d+$/.test(nodo.textContent.trim()))
            ]);
            document.querySelector('#modal [data-perfil-tab="pendiente"]')?.click();
            await pausa(200);
            pasos.push([
                "cambio a pendientes",
                document.querySelector('#modal [data-perfil-tab="pendiente"]')?.classList.contains("is-active")
                    && Boolean(document.querySelector("#modal [data-perfil-panel]"))
            ]);
            pasos.push([
                "foto de perfil editable",
                Boolean(document.querySelector("#modal [data-perfil-foto]"))
                    && Boolean(document.querySelector("#modal [data-perfil-input]"))
            ]);
            document.querySelector('#modal [data-accion="cerrarModal"]')?.click();
            return pasos;
        })()`);
        registrar('ciudadano.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        registrar('ciudadano.html sin errores', sesion.errores.length === 0, sesion.errores.join(' | '));
    }

    // ---------- Empresa ----------
    {
        const { sesion } = await abrirPestana();
        await prepararAlmacen(sesion, cuentas.empresa, 'empresa.html');
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const analitica = document.querySelector('.menu a[data-accion="irAAnalitica"]');
            analitica?.click();
            await pausa(400);
            pasos.push(["menú analítica", Boolean(analitica?.classList.contains("active"))]);
            const equipo = document.querySelector('.menu a[data-accion="irAEquipo"]');
            equipo?.click();
            await pausa(400);
            pasos.push([
                "sección de equipo con códigos",
                Boolean(equipo?.classList.contains("active"))
                    && Boolean(document.querySelector("#equipo .team-notice"))
                    && document.querySelectorAll("#listaEquipo [data-accion='generarCodigoOperario']").length > 0
            ]);
            const filtro = document.querySelector('[data-accion="filtrarMapa"]');
            filtro?.click();
            await pausa(300);
            pasos.push(["filtro de mapa", Boolean(filtro?.classList.contains("active"))]);
            document.querySelector('[data-accion="refrescarMapa"]')?.click();
            await pausa(300);
            pasos.push(["refrescar mapa", true]);
            document.querySelector('[data-accion="mostrarNotificaciones"]')?.click();
            await pausa(600);
            pasos.push(["notificaciones o aviso", Boolean(document.getElementById("modal")?.classList.contains("show")) || document.getElementById("toast")?.classList.contains("show")]);
            document.querySelector('#modal [data-accion="cerrarModal"]')?.click();
            const respaldo = window.RunTrashFeatures.reporteImagen(
                "",
                { imagen_url: null },
                "report-thumb",
                "🗑️"
            );
            pasos.push(["foto de respaldo", respaldo.includes("report-thumb-vacio")]);
            return pasos;
        })()`);
        registrar('empresa.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        const erroresReales = sesion.errores.filter((linea) => !linea.includes('/uploads/'));
        registrar('empresa.html sin errores', erroresReales.length === 0, erroresReales.join(' | '));
    }

    // ---------- Operario ----------
    {
        const { sesion } = await abrirPestana();
        await prepararAlmacen(sesion, cuentas.operario, 'operario.html');
        const acciones = await sesion.evaluar(`(async () => {
            /**
             * Pausa la ejecución para dar tiempo al DOM a reaccionar.
             *
             * @param {number} ms - Milisegundos.
             * @returns {Promise<void>}
             */
            const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
            const pasos = [];
            const enlace = document.querySelector('.menu a[data-accion="irAReportes"]');
            enlace?.click();
            await pausa(200);
            pasos.push(["menú reportes", Boolean(enlace?.classList.contains("active"))]);
            document.querySelector('[data-accion="refrescarReportes"]')?.click();
            await pausa(500);
            pasos.push(["refrescar reportes", true]);
            document.querySelector('[data-accion="mostrarNotificaciones"]')?.click();
            await pausa(600);
            pasos.push(["notificaciones o aviso", Boolean(document.getElementById("modalDetalles")?.classList.contains("show")) || document.getElementById("toast")?.classList.contains("show")]);
            document.querySelector('#modalDetalles [data-accion="cerrarDetalles"]')?.click();
            document.querySelector('[data-accion="mostrarPerfil"]')?.click();
            await pausa(300);
            pasos.push(["perfil", Boolean(document.getElementById("modalDetalles")?.classList.contains("show"))]);
            document.querySelector('#modalDetalles [data-accion="cerrarDetalles"]')?.click();
            return pasos;
        })()`);
        registrar('operario.html', acciones.every(([, ok]) => ok), JSON.stringify(acciones));
        registrar('operario.html sin errores', sesion.errores.length === 0, sesion.errores.join(' | '));
    }
} finally {
    chrome.kill();
    await esperar(800);
    try {
        fs.rmSync(PERFIL, { recursive: true, force: true });
    } catch {
        // Windows puede mantener el perfil bloqueado unos segundos.
    }
}

console.table(resultados);

if (resultados.some((item) => !item.ok)) {
    process.exitCode = 1;
}
