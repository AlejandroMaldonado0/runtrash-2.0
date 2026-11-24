# Arquitectura de RunTrash

Documento de referencia para entender cómo está organizado el proyecto
y cómo ampliarlo siguiendo una estructura modular.

> Los diagramas de contexto, componentes, clases, entidad-relación,
> secuencias, estados, actividad, despliegue y navegación están en
> [`DIAGRAMAS.md`](DIAGRAMAS.md).

## Vista general

```text
runtrash 2.0/
├─ index.html            ← landing + login/registro
├─ ciudadano.html        ← panel ciudadano
├─ empresa.html          ← panel empresa
├─ operario.html         ← panel operario
├─ admin.html            ← panel administrador
├─ control.html          ← panel de Distrito, Policía y SSPD
├─ styles.css            ← punto de entrada de estilos (@import)
├─ features.js           ← utilidades comunes del frontend
├─ ui.js                 ← sidebar, modales y accesibilidad
├─ config.js             ← URL opcional de la API
├─ logos/                ← imágenes estáticas
├─ frontend/
│  ├─ pages/             ← lógica de cada página (sin scripts inline)
│  │  ├─ inicio/         ← login, registro, recuperación y arranque
│  │  ├─ ciudadano/      ← estado, datos, formulario, render, perfil…
│  │  ├─ empresa/        ← estado, datos, mapa, render, acciones…
│  │  ├─ operario/       ← estado, datos, estados, rutas, render…
│  │  ├─ admin/          ← sesión, usuarios, configuración, render…
│  │  └─ control/        ← datos, filtros, detalle, seguimientos…
│  ├─ shared/            ← utilidades de navegador reutilizables
│  │  ├─ api.js          ← base de la API, token y fetch con sesión
│  │  ├─ concurrencia.js ← deduplicación, cancelación y sondeos
│  │  ├─ ui-common.js    ← toasts, sesión y campana de notificaciones
│  │  ├─ perfil.js       ← identidad, foto, guía por rol y resumen de reportes
│  │  └─ notificaciones-ui.js ← barra y modal de notificaciones
│  └─ styles/            ← módulos CSS importados por styles.css
│     ├─ 00-inicio.css   ← base extraída del antiguo <style> de index
│     ├─ 01-base.css
│     ├─ 02-acceso.css
│     ├─ 03-paneles.css
│     ├─ 04-tarjetas.css
│     ├─ 05-modales.css
│     ├─ 06-responsive.css
│     ├─ 07-componentes.css
│     ├─ 08-recuperacion.css
│     ├─ 09-polish.css
│     ├─ 10-responsive-refinado.css
│     ├─ 11-notificaciones.css
│     ├─ 12-control.css
│     ├─ 13-rediseno.css ← capa final: profundidad, color y guías didácticas
│     └─ 14-perfil.css  ← perfil didáctico y emojis/colores por rol
└─ servidor/
   ├─ server.js          ← composición de Express (sin rutas de negocio)
   ├─ config.js          ← entorno, CORS, CSP y constantes
   ├─ routes/            ← routers por dominio
   │  ├─ public.js       ← salud, SSE y configuración pública
   │  ├─ auth.js         ← registro, login y contraseñas
   │  ├─ notificaciones.js
   │  ├─ reportes.js     ← creación y consultas de reportes
   │  ├─ empresa.js      ← operarios, asignaciones y estados
   │  ├─ admin.js        ← usuarios y configuración del sistema
   │  ├─ perfil.js       ← resumen de reportes y foto de perfil
   │  └─ control.js      ← Distrito, Policía y SSPD
   ├─ services/          ← lógica de negocio y transacciones
   │  ├─ errores.js      ← errores de dominio con estado HTTP sugerido
   │  └─ reportes.js     ← crear, asignar y cambiar estado
   ├─ repositories/      ← acceso a datos (todo el SQL vive aquí)
   │  ├─ public.js
   │  ├─ auth.js
   │  ├─ notificaciones.js
   │  ├─ reportes.js
   │  ├─ empresa.js
   │  ├─ admin.js
   │  ├─ perfil.js       ← conteos por rol y avatar
   │  └─ control.js
   ├─ lib/
   │  ├─ db.js           ← pool PostgreSQL y transacciones
   │  ├─ concurrencia.js ← paralelismo y límites de tareas
   │  ├─ auth.js         ← sesiones y roles
   │  ├─ eventos.js      ← Server-Sent Events
   │  ├─ notificaciones.js
   │  ├─ limiters.js     ← rate limiting general y de auth
   │  ├─ mantenimiento.js ← retención y limpieza de sesiones
   │  ├─ admin-inicial.js ← cuenta administradora inicial
   │  ├─ upload.js       ← Multer (memoria)
   │  ├─ almacen.js      ← disco local / Neon Object Storage
   │  └─ security.js     ← hashes de contraseñas y tokens
   ├─ migrations/        ← SQL versionado
   ├─ scripts/
   │  ├─ migrate.js      ← ejecutor de migraciones
   │  └─ verificar-ui.mjs ← pruebas headless con Chrome DevTools Protocol
   └─ test/              ← pruebas con node:test
```

## Principios aplicados

1. **Separación de responsabilidades**: cada módulo de `lib/` resuelve
   un único problema (base de datos, auth, eventos, archivos…) y cada
   router de `routes/` agrupa un dominio funcional.
2. **Capa de servicios**: `services/` decide las reglas de negocio y
   abre transacciones; los routers solo validan la entrada y traducen
   errores a HTTP.
3. **Capa de repositorios**: ningún router escribe SQL. `routes/` valida
   la entrada y arma la respuesta; `repositories/` es la única capa que
   llama `pool.query`, lo que permite probar y reutilizar consultas.
4. **Composición en `server.js`**: el punto de entrada solo conecta
   middleware, routers y arranque; no contiene lógica de negocio.
5. **Configuración centralizada**: `servidor/config.js` es el único
   lugar que lee `process.env` para constantes de la aplicación.
6. **Documentación con JSDoc**: funciones, módulos y routers llevan
   `@param`, `@returns` y `@module` para que el editor muestre ayuda.
7. **Frontend por capas**: HTML solo estructura, `frontend/pages/` la
   lógica de cada pantalla, `frontend/shared/` lo reutilizable y
   `frontend/styles/` la presentación dividida por responsabilidad.
8. **Concurrencia explícita**: las tareas independientes se ejecutan en
   paralelo, las escrituras se protegen con transacciones y el frontend
   deduplica peticiones para que los sondeos no se solapen.
9. **Pruebas**: `node --test` valida seguridad, guards y utilidades sin
   necesitar una base de datos real.

## Convención de documentación

Todo el código sigue el mismo formato para que el editor y GitHub
muestren la ayuda sin herramientas extra.

| Elemento | Formato |
| --- | --- |
| Archivo | Bloque `/** @file ... @module ... */` al inicio |
| Función | JSDoc con descripción, `@param` y `@returns` |
| Método de objeto | JSDoc dentro del objeto, antes del método |
| Bloque complejo | Comentario `/* ... */` que explica el porqué |
| CSS | Cabecera con módulo y responsabilidad |

Reglas:

1. El bloque de archivo describe el propósito y las dependencias.
2. Toda función recibe `@param` por cada argumento y `@returns` si
   devuelve algo; `@returns {void}` cuando no.
3. Las funciones que pueden fallar documentan `@throws`.
4. Los comentarios explican decisiones (límites, orden de capas,
   compatibilidad), no repiten lo que ya dice el código.
5. Los scripts de prueba y las migraciones también se documentan.

Estado actual: todas las funciones tienen JSDoc y todos los archivos
`.js`/`.mjs` tienen su bloque `@file`; el auditor queda en 0 pendientes.

## Flujo de una petición

```text
Cliente HTTP
   │
   ▼
helmet + CORS + rate limit   (config.js)
   │
   ▼
express.json / urlencoded
   │
   ▼
requiereSesion  →  lib/auth.js  →  PostgreSQL
   │
   ▼
Router del dominio (routes/*.js)  ← valida y responde
   │
   ▼
services/*.js  ← reglas de negocio
   │
   ▼
repositories/*.js  ← SQL parametrizado
   │
   ├─ lib/notificaciones.js  (avisos)
   ├─ lib/eventos.js         (SSE a clientes)
   └─ lib/almacen.js         (imágenes)
```

## Concurrencia y transacciones

La concurrencia se resuelve en dos niveles.

**Backend**

- `lib/concurrencia.js` expone `enParalelo`, `enParaleloSeguro` y
  `mapaConcurrente`. Se usa para lanzar consultas o notificaciones
  independientes a la vez y para procesar lotes con un máximo de tareas
  simultáneas.
- `lib/db.js` expone `conTransaccion(trabajo)`: reserva un cliente,
  ejecuta `BEGIN`, confirma con `COMMIT` y revierte con `ROLLBACK`.
- Los repositorios aceptan un ejecutor opcional (`cliente = pool`), de
  forma que el mismo SQL participa en una transacción sin duplicarse.
- `services/reportes.js` agrupa las escrituras críticas:
  - crear reporte: bloquea la fila del usuario, comprueba el límite
    diario e inserta en una sola transacción;
  - asignar operario: bloquea el reporte con `FOR UPDATE` y elige al
    operario con `FOR UPDATE SKIP LOCKED`;
  - cambiar estado: el `UPDATE` filtra por operario y serializa los
    cambios sobre el mismo reporte.

Nunca se ejecutan dos consultas a la vez sobre el mismo `PoolClient`:
dentro de una transacción las operaciones van en serie.

**Frontend**

`frontend/shared/concurrencia.js` expone:

| Función | Uso |
| --- | --- |
| `ejecutar(clave, tarea)` | Deduplica: si la clave ya está en curso, devuelve la misma promesa |
| `cancelar(clave)` | Aborta la petición con `AbortController` |
| `cancelarTodo()` | Cancela todo al salir de la página |
| `enParaleloSeguro(tareas)` | Espera varias tareas sin abortar por un fallo |
| `crearRefresco(tarea, opciones)` | Sondeo periódico que nunca se solapa consigo mismo |

Cada página envuelve sus cargas (`cargarReportes`, `cargarDatos`,
`cargarTodo`, `refrescarTodo`) en `ejecutar` y sustituye `setInterval`
por `crearRefresco`. Así el canal SSE, los botones y el sondeo comparten
la misma petición en lugar de competir.

## Cómo añadir una ruta

Crea o reutiliza un router en `servidor/routes/`. Cada router se monta
en `server.js` y comparte los guards de `lib/auth.js`. La ruta valida,
delega en `services/` y responde; no escribe SQL ni reglas de negocio.

```js
// servidor/routes/ejemplo.js
const express = require('express');
const ejemploService = require('../services/ejemplo');
const { esErrorServicio } = require('../services/errores');
const { requiereSesion } = require('../lib/auth');

const router = express.Router();

/**
 * Devuelve un resumen de ejemplo.
 */
router.get('/ejemplo', requiereSesion, async (_req, res) => {
    try {
        const resumen = await ejemploService.obtenerResumen();
        res.json({ ok: true, resumen });
    } catch (error) {
        if (esErrorServicio(error)) {
            return res.status(error.estado).json({ ok: false, mensaje: error.message });
        }
        console.error('Error en /api/ejemplo:', error);
        res.status(500).json({ ok: false, mensaje: 'Error interno.' });
    }
});

module.exports = router;
```

Después se registra en `server.js` junto a los demás routers:

```js
const ejemploRoutes = require('./routes/ejemplo');
app.use('/api', ejemploRoutes);
```

## Cómo extraer un módulo

1. Identifica funciones que compartan una responsabilidad.
2. Si es infraestructura, crea el archivo en `servidor/lib/`; si es una
   regla de negocio, en `servidor/services/`; si es un dominio HTTP,
   créalo en `servidor/routes/`.
3. Añade un bloque JSDoc `@file` y `@module`.
4. Exporta solo la API pública (`module.exports`).
5. Importa en `server.js` (o en el router correspondiente) y elimina
   la copia local.
6. Ejecuta `node --test` y `node --check`.

## Estilos modulares

`styles.css` ya no contiene reglas: es el punto de entrada que importa
los módulos de `frontend/styles/` en el mismo orden histórico. Ese orden
importa porque `09-polish.css`, `10-responsive-refinado.css`,
`11-notificaciones.css`, `13-rediseno.css` y `14-perfil.css` refinan a los
anteriores.

`13-rediseno.css` es la capa visual final del rediseño: concentra los
degradados con profundidad, los estados con color propio, los pasos guiados
de cada panel (`.hero-flow`), la leyenda de estados (`.estado-leyenda`) y los
pasos del acceso público (`.auth-steps`). No cambia la estructura ni el
comportamiento: solo la presentación.

`14-perfil.css` cierra la cascada con el perfil didáctico: identidad con
emoji y color por rol, guía rápida de tres pasos, datos con iconos y acentos
en los botones de rol del login y en los badges del panel administrador.

Reglas para mantener la hoja de estilos:

1. Cada archivo cubre una sola responsabilidad (base, acceso, paneles,
   tarjetas, modales, componentes, responsive, notificaciones, control).
2. No se añaden reglas nuevas a `styles.css`; se edita el módulo que
   corresponda o se crea uno nuevo y se importa al final de la lista.
3. Los nombres de archivo llevan prefijo numérico para hacer explícita
   la cascada.
4. Nunca se rompe un bloque `@media` entre dos archivos.
5. Tras un cambio visual se comprueba que `/styles.css` y cada módulo
   respondan `200` y que la página mantenga su apariencia.

## Acciones de interfaz y CSP

Las páginas ya no usan `onclick`, `onchange` ni `onsubmit`. En su lugar
declaran la acción con atributos `data-*`:

```html
<button data-accion="irAReportes"
        data-pasar="elemento"
        data-args='["all"]'>Mis reportes</button>
```

`frontend/shared/ui-common.js` escucha `click`, `change`, `input`,
`submit` y `error` por delegación y ejecuta la función global indicada:

| Atributo | Uso |
| --- | --- |
| `data-accion` | Nombre de la función en `window` |
| `data-args` | Array JSON de argumentos |
| `data-pasar` | `elemento` (primer argumento) o `evento` |

Reglas:

1. La función debe existir en `window` (declaración global o asignación
   explícita).
2. Los enlaces y formularios reciben `preventDefault()` automático.
3. Los formularios solo se disparan en `submit`, nunca en clics internos.
4. Las acciones con datos dinámicos usan plantillas:
   `data-args='[${Number(reporte.id)}]'`.
5. Las imágenes con respaldo usan `data-accion="imagenNoDisponible"` en
   lugar de `onerror`.

Gracias a esto la CSP no incluye `unsafe-inline` ni `unsafe-eval` en
ninguna directiva de scripts (`script-src`, `script-src-attr`). Solo
`style-src` conserva `unsafe-inline` por los estilos que Leaflet aplica
en línea a los mapas.

## Roles y permisos

| Rol | Panel | Alcance |
| --- | --- | --- |
| `ciudadano` | `ciudadano.html` | Crea y consulta sus propios reportes |
| `operario` | `operario.html` | Atiende los reportes asignados |
| `empresa` | `empresa.html` | Administra operarios y reportes de su empresa |
| `admin` | `admin.html` | Control total del sistema |
| `distrito` | `control.html` | Consulta todos los reportes; seguimientos aislados por ente |
| `policia` | `control.html` | Consulta todos los reportes; seguimientos aislados por ente |
| `sspd` | `control.html` | Consulta todos los reportes; seguimientos aislados por ente |

El rol `admin` no se ofrece en el login público: se entra por
`admin.html`, que valida las credenciales y comprueba que la cuenta sea
de administrador antes de mostrar el panel.

Los tres entes de control usan el mismo guard `requiereEnteControl`
(`lib/auth.js`) y los endpoints `/api/control/*`. Sus seguimientos se
guardan en la tabla `seguimientos_reportes` (migración `006`), lo que
deja trazabilidad de observaciones, requerimientos, visitas y cierres.

Cada ente es independiente: el repositorio filtra por `ente = rol`, de
modo que Distrito, Policía y SSPD solo leen y cuentan sus propios
seguimientos aunque compartan la lista de reportes de la ciudad. El
administrador conserva la vista global (`enteAislado('admin') → null`) y
los eventos SSE de un seguimiento solo llegan al ente autor y a
administración.

Solo el administrador puede crear cuentas de estos tres roles. El
registro público (`/api/registro`) solo crea ciudadanos; las cuentas de
empresa y operario las crea un administrador desde `admin.html`. La API
también permite a una empresa crear operarios dentro de su propia
organización (`POST /api/operarios`), y su panel web los lista en
**Equipo** para emitir los códigos de verificación.

### Código de operario y segundo factor

- El **código de operario** son los últimos cuatro dígitos del NIT de su
  empresa (`lib/nit.js`). Nunca se acepta el valor que envíe el cliente:
  el servidor lo deriva del NIT y la migración `008` instala el trigger
  `usuarios_validar_codigo_operario`, que rechaza cualquier otro código.
- Varios operarios de una misma empresa comparten código. La identidad
  de la cuenta es el correo, por eso se elimina el índice único global
  sobre `codigo_operario` y se usa un índice no único
  `(empresa_id, codigo_operario)` para las búsquedas. El NIT solo es
  único para las cuentas de tipo `empresa` (migración `009`), no para
  cada operario.
- En el login, el operario confirma su código y la empresa su NIT
  comparando solo los dígitos. Tras cinco intentos fallidos la cuenta se
  bloquea 15 minutos (`intentos_fallidos`, `bloqueado_hasta`).
- La empresa (o un administrador) puede generar un **código de
  verificación adicional** de seis dígitos por operario. Se guarda con
  `scrypt` en `usuarios.codigo_verificacion_hash` (migración `010`), se
  muestra una sola vez y al rotarlo se revocan las sesiones del operario
  (`services/operarios.js`). Mientras la cuenta no tenga ese hash, el
  login acepta solo el código del NIT para no bloquear cuentas existentes.
- Las contraseñas usan `scrypt`. `validarPassword` exige entre 8 y 128
  caracteres con al menos una letra y un número; las heredadas en texto
  plano se rehashean al arrancar y `verifyPassword` ya no las acepta.

### Ingreso con Google y Outlook

`routes/auth/oauth.js` implementa OAuth 2.0 con PKCE (`lib/oauth.js`):

1. `/api/auth/oauth/:proveedor/iniciar` genera `state` y `code_verifier`,
   firma el estado con HMAC y los guarda en una cookie HttpOnly de 10
   minutos antes de redirigir al proveedor.
2. El callback valida la firma, el `state` y el `expira`, intercambia el
   código y consulta el correo verificado.
3. Solo se permite el ingreso de cuentas **ya registradas y activas** que
   no sean operarios. No se crean cuentas desde OAuth.
4. El callback no expone el token: emite un código aleatorio de un solo
   uso (`oauth_codigos`, migración `011`) y redirige a `index.html`. El
   frontend lo canjea en `POST /api/auth/oauth/canjear`.

Los proveedores se activan con `GOOGLE_CLIENT_ID/SECRET`,
`MICROSOFT_CLIENT_ID/SECRET` y `OAUTH_BASE_URL`. Sin credenciales la API
los marca como no configurados y el login muestra el aviso.

Para pruebas locales, la migración `007_cuentas_demo.sql` siembra
cuentas de demostración (Distrito, Policía, SSPD y un administrador).
El ejecutor de migraciones las omite en producción salvo que se defina
`SEED_DEMO_ACCOUNTS=true`; si ya existían de un despliegue anterior, las
desactiva y cierra sus sesiones. Las contraseñas no están en archivos
versionados: viven en `servidor/.credenciales-demo.local.md`, ignorado
por Git.

### Perfil y resumen de reportes

El modal compartido `frontend/shared/perfil.js` pide
`GET /api/perfil/resumen`. `repositories/perfil.js` decide el alcance
por rol antes de contar:

| Rol | Reportes que cuenta |
| --- | --- |
| `ciudadano` | Los creados por la cuenta |
| `operario` | Los asignados a la cuenta |
| `empresa` | Los de sus operarios y los libres de sus localidades |
| `admin`, `distrito`, `policia`, `sspd` | Todos |

La consulta devuelve totales por estado y hasta seis reportes recientes
de cada uno. El frontend los agrupa en las pestañas **Resumen**,
**Pendientes**, **En proceso** y **Completados**, con ilustraciones
según el tipo de residuo.

La foto se envía a `PUT /api/perfil/avatar` como data URL ya recortada
por el navegador (cuadrado de 256 px, WEBP o JPEG). Se guarda en
`usuarios.avatar_url` (migración `012`) y viaja con el usuario de la
sesión, de modo que no hace falta una ruta pública nueva.

## Seguridad de datos sensibles

- **Fotos de reportes**: `/uploads/*` ya no es una carpeta estática.
  Exige sesión y comprueba que el usuario sea el dueño del reporte, el
  operario asignado, tenga un rol global (`admin`, `distrito`, `policia`,
  `sspd`) o sea una empresa con ese reporte en su ámbito (operario de su
  empresa o reporte libre en una localidad que atiende). Una empresa
  nunca ve fotos de otra. El frontend añade `?token=` a la URL porque un
  `<img>` no puede mandar la cabecera `Authorization`.
- **Token por URL limitado**: `obtenerToken` solo lee `?token=` cuando la
  ruta lo habilita con `permitirTokenEnQuery`; hoy solo ocurre en
  `/api/eventos` y `/uploads`. En el resto de la API el token debe ir en
  `Authorization: Bearer`.
- **Foto de perfil**: el servidor valida que el data URL sea PNG, JPEG o
  WEBP, rechaza SVG y limita el tamaño a 420 000 caracteres. El
  navegador reduce la imagen antes de enviarla; el cliente nunca puede
  inyectar HTML en el avatar.
- **Eventos SSE filtrados**: cada evento declara destinatarios por
  usuario, rol o empresa; por defecto va solo a administración. Los
  clientes de una empresa no reciben eventos de otra y un ciudadano no
  recibe los de otro.
- **Sesiones**: se revocan al cambiar correo, rol, empresa, código de
  operario, localidad o contraseña, y al desactivar la cuenta. Los
  cambios de privilegios no sobreviven al token anterior.
- **CORS y caché**: un `Origin` ajeno recibe 403; no se refleja una lista
  abierta. Todas las respuestas de `/api` llevan `Cache-Control:
  no-store` para que no queden datos de sesión en cachés intermedias.
- **Recuperación de contraseña**: `codigo_demo` solo se devuelve si
  `EXPOSER_CODIGO_RECUPERACION=true` de forma explícita. En producción el
  valor por defecto es `false` y el código no se escribe en los logs. El
  evento de restablecimiento se dirige solo al usuario afectado.
- **Secretos**: `.env`, `servidor/.env` y las credenciales demo locales
  están en `.gitignore` y fuera de la lista blanca de archivos estáticos.
- **Errores**: las respuestas 500 no incluyen `error.message` ni objetos
  del reporte (descripción, ubicación, coordenadas).

## Deuda técnica conocida

- **CSP de scripts cerrada**: `script-src` y `script-src-attr` ya no
  permiten `unsafe-inline` ni `unsafe-eval`. Queda `style-src` con
  `unsafe-inline` por los estilos en línea de Leaflet; si se migran a
  clases, se puede retirar.
- **Helpers del frontend**: `cargarNotificaciones`, `marcarNotificacionesLeidas`,
  `seleccionarMenu`, `imagenNoDisponible`, el despachador de acciones y
  el coordinador de concurrencia viven en `frontend/shared/`; quedan
  variantes locales de `abrirWaze`/`abrirUbicacion` porque dependen de
  los datos de cada panel.
- **CSS importado con `@import`**: es claro y mantiene la cascada, pero
  encadena peticiones. Si el rendimiento lo exige, se puede generar un
  archivo único en el build sin tocar los módulos.
- **Estilos y modales compartidos**: el bloque `<style>` de `index.html`
  se movió a `frontend/styles/00-inicio.css` y los modales de perfil y
  notificaciones viven en `frontend/shared/perfil.js` y
  `frontend/shared/notificaciones-ui.js`. Las páginas conservan pequeñas
  envolturas porque cada panel usa ids y acciones distintas.
- **Scripts clásicos por página**: las páginas usan varios `<script defer>`
  en orden para compartir el entorno global que exige `data-accion`.
  Migrar a módulos ES permitiría imports explícitos, pero requiere
  ajustar el despachador de acciones y la CSP.
- **SQL fuera de `repositories/`**: quedan consultas en
  `lib/admin-inicial.js`, `lib/imagenes.js`, `lib/mantenimiento.js`,
  `lib/notificaciones.js` y `scripts/migrate.js`. Son tareas de
  infraestructura, pero rompen la regla “solo los repositorios ejecutan
  SQL”.
- **Archivos grandes**: `features.js` (708 líneas),
  `frontend/pages/empresa/mapa.js` (384) y
  `frontend/styles/07-componentes.css` (1.675) concentran demasiadas
  responsabilidades. Deberían dividirse por tema (mapa, tarjetas,
  utilidades de reportes, etc.).
- **Estado global del frontend**: hay 19 asignaciones `window.*` para
  que `data-accion` encuentre las funciones. Es intencional por la CSP,
  pero conviene registrar las acciones en un mapa explícito en vez de
  depender de propiedades sueltas.

## Métricas de modularidad

Medición sobre el código actual (sin `node_modules`): 56 archivos de
backend con 7.912 líneas y 65 archivos JS de frontend con 6.105 líneas.
Se suman 6 páginas HTML (1.375 líneas) y 15 hojas CSS (7.504 líneas).

| Capa | Estado | Por qué |
| --- | --- | --- |
| Backend (`servidor/`) | ≈ 91 % | Routers finos, `services/` con transacciones y repositorios por dominio. Descuenta el SQL de infraestructura y `routes/reportes/crear.js`, que abre su propia transacción. |
| Frontend (HTML + JS + CSS) | ≈ 84 % | HTML sin scripts, estilos ni handlers inline; páginas divididas por responsabilidad. Descuenta `features.js`, `empresa/mapa.js`, el CSS de componentes y las 19 globales `window.*`. |
| Documentación y pruebas | ≈ 80 % | Diagramas y JSDoc completos, pero la cobertura de pruebas es de integración ligera y no cubre todos los repositorios. |
| **Global ponderado** | **≈ 86 %** | 0,55 × 91 + 0,35 × 84 + 0,10 × 80. |

Los porcentajes son una estimación de revisión: miden separación de
responsabilidades, ausencia de SQL en routers, ausencia de lógica de
negocio en `server.js` y ausencia de bloques gigantes en un solo archivo.
No son una métrica automática de acoplamiento.

