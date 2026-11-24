# RunTrash

Aplicación web y API para reportar y gestionar residuos en Bogotá. El frontend son páginas estáticas y el backend es Express + PostgreSQL; ambos viven en este repositorio.

## Arranque local

1. Instala las dependencias del servidor (una sola vez):

```powershell
cd servidor
npm.cmd install
```

2. Revisa `servidor/.env` con los datos de PostgreSQL y el administrador inicial.

3. Aplica las migraciones (una sola vez):

```powershell
cd servidor
node scripts/migrate.js
```

4. Arranca la app desde la raíz del proyecto:

```powershell
node servidor/server.js
```

5. Abre <http://localhost:3000>.

El servidor sirve la API en `/api` y las páginas (`index.html`, `ciudadano.html`, etc.) en el mismo puerto. No hace falta un servidor estático aparte.

> Si `npm` está bloqueado por la política de PowerShell, usa `npm.cmd` o ejecuta los scripts directamente con `node`.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `servidor/` | API Express, migraciones, pruebas y scripts |
| `frontend/` | Módulos JavaScript de cada página y componentes compartidos |
| `docs/` | [Arquitectura](docs/ARQUITECTURA.md) y [diagramas](docs/DIAGRAMAS.md) |
| raíz | Páginas HTML, `styles.css`, `ui.js`, `features.js` y `config.js` |

## Pruebas

```powershell
cd servidor
node --test
node scripts/verificar-ui.mjs
node scripts/verificar-seguridad.mjs
```

`verificar-ui.mjs` y `verificar-seguridad.mjs` necesitan el servidor en
marcha en <http://localhost:3000>. El segundo comprueba autorregistro,
segundo factor, tenancy, CORS, caché, tokens por query y el trigger del
código de operario sin ejecutar ataques destructivos.

La guía de despliegue está en [`DEPLOY.md`](DEPLOY.md).

## Perfil y resumen de reportes

Todos los paneles comparten el modal de **Mi perfil**
(`frontend/shared/perfil.js`). Incluye:

- Un cuadro de resumen con el total y pestañas para **Resumen**,
  **Pendientes**, **En proceso** y **Completados**. Cada pestaña usa
  ilustraciones por categoría y muestra los últimos reportes de ese
  estado. El alcance lo decide el servidor según el rol: el ciudadano ve
  los suyos, el operario los asignados, la empresa los de su ámbito y el
  administrador o los entes de control la visión global.
- Una **foto de perfil editable**: al tocar el avatar se elige una imagen,
  el navegador la recorta al centro en 256×256 y la guarda en la cuenta
  (`usuarios.avatar_url`). También se puede quitar.

Endpoints: `GET /api/perfil/resumen` y `PUT /api/perfil/avatar`.

## Seguridad

- **Autorregistro solo de ciudadanos**. Las cuentas de empresa y operario
  las crea un administrador desde `admin.html`; la empresa gestiona su
  equipo y emite los códigos de verificación desde su panel.
- **Acceso de administrador oculto.** El rol `admin` no aparece en el
  login público: se entra directamente por `admin.html`, que valida la
  sesión y exige credenciales de administrador.
- **Código de operario = últimos 4 dígitos del NIT de su empresa.** El
  cliente nunca elige el código: el servidor lo deriva del NIT y un
  trigger de PostgreSQL rechaza cualquier otro valor.
- **Código de verificación adicional por operario.** La empresa lo genera
  en la sección **Equipo** de su panel. Tiene 6 dígitos, se guarda con
  `scrypt`, se muestra una sola vez y al rotarlo se revocan las sesiones
  del operario. Es **obligatorio**: sin él, el operario no puede entrar
  aunque tenga el código del NIT.
- **Segundo factor en el login**: el operario confirma sus dos códigos y
  la empresa su NIT. La cuenta se bloquea temporalmente tras cinco
  intentos fallidos.
- **Ingreso con Google y Outlook (OAuth 2.0 + PKCE)**: solo para correos
  ya registrados y activos, nunca para operarios. El `state` viaja en una
  cookie HttpOnly y el token se entrega al frontend mediante un código de
  un solo uso, nunca en la URL. Sin credenciales reales se puede activar
  `OAUTH_DEMO=1` en local para probar el flujo con una pantalla del
  propio servidor; ese modo no valida la identidad con el proveedor.
- **El rol real manda en el login**: el perfil elegido en la pantalla es
  solo una ayuda. Si la cuenta es de empresa u operario, el servidor
  pide el NIT o los códigos que falten y el formulario abre el rol
  correcto sin perder el correo ni la contraseña.
- **Contraseñas con `scrypt`** y política mínima de 8 caracteres con
  letras y números. Las contraseñas heredadas en texto plano se convierten
  a `scrypt` al arrancar y ya no se aceptan.
- **Sesiones revocadas** ante cambios de correo, rol, empresa, código o
  contraseña, y al desactivar una cuenta.
- **Fotos de `/uploads/*`**: exigen sesión y se autorizan por dueño,
  operario asignado, rol global o empresa con el reporte en su ámbito.
- **Foto de perfil**: se guarda como data URL recortada. El servidor solo
  acepta PNG, JPEG o WEBP de hasta 420 000 caracteres y rechaza SVG para
  evitar contenido ejecutable.
- **Token por URL** solo se acepta en `/api/eventos` y `/uploads` (SSE e
  imágenes); en el resto de la API debe ir en `Authorization`.
- **CORS cerrado**, `Cache-Control: no-store` en `/api` y CSP sin
  `unsafe-inline` para scripts.
- En producción no se exponen códigos de recuperación ni se siembran
  cuentas demo salvo `SEED_DEMO_ACCOUNTS=true`.
- `.env` y las credenciales locales están ignorados por Git y no se
  sirven por la lista blanca de archivos estáticos.
- Detalle en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#seguridad-de-datos-sensibles).
