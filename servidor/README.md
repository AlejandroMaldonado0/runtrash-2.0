# API RunTrash

API REST compartida por la página web y la aplicación Flutter. PostgreSQL es la base de datos; los clientes nunca se conectan directamente a ella.

## Configuración local

1. Copia `.env.example` como `.env`.
2. Completa `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.
3. Configura las credenciales del administrador inicial (`ADMIN_*`).
4. Instala y prepara la base de datos:

```bash
npm install
npm run db:migrate
npm run dev
```

La API queda disponible en `http://localhost:3000`. Para un dispositivo Android emulador, Flutter usa `http://10.0.2.2:3000` por defecto. Para un teléfono físico se debe proporcionar la IP local de la computadora mediante `--dart-define=API_BASE_URL=...`.

## Migraciones

- No modifiques una migración que ya fue aplicada.
- Agrega un nuevo archivo SQL en `migrations/` para el siguiente cambio de esquema.
- Ejecuta `npm run db:migrate` antes de iniciar una versión nueva del servidor.
- Haz un backup de PostgreSQL antes de ejecutar cambios destructivos.

## Cuentas de demostración

La migración `007_cuentas_demo.sql` crea (o restaura) cuentas para probar
los roles de control y el panel de administración:

| Correo | Rol |
| --- | --- |
| `distrito@runtrash.test` | `distrito` |
| `policia@runtrash.test` | `policia` |
| `sspd@runtrash.test` | `sspd` |
| `admin.prueba@runtrash.test` | `admin` |

> **Solo para desarrollo o demostración.** Usan contraseñas conocidas.
> Las contraseñas no se guardan en archivos versionados: están en
> `servidor/.credenciales-demo.local.md`, que Git ignora. En producción
> la migración se omite salvo que definas `SEED_DEMO_ACCOUNTS=true`.

La migración es idempotente: no duplica cuentas y, si ya existen,
restaura su contraseña, rol y estado activo. Ten en cuenta que el
ejecutor omite las migraciones ya aplicadas; para volver a sembrarlas,
elimina la fila `007_cuentas_demo.sql` de `schema_migrations` y ejecuta
`npm run db:migrate` de nuevo.

## Estructura modular

`server.js` es el punto de composición. La lógica reutilizable vive en `lib/` y las rutas por dominio en `routes/`:

| Módulo | Responsabilidad |
| --- | --- |
| `config.js` | Variables de entorno, CORS, CSP y constantes |
| `routes/public.js` | Salud, SSE y configuración pública |
| `routes/auth/` | Registro, login, OAuth (Google/Outlook), sesión y contraseñas |
| `routes/notificaciones.js` | Centro de notificaciones |
| `routes/reportes/` | Creación y consultas de reportes |
| `routes/empresa/` | Operarios, asignaciones y estados |
| `routes/admin/` | Usuarios y configuración del sistema |
| `routes/control.js` | Panel de Distrito, Policía y SSPD (seguimientos aislados por ente) |
| `services/reportes.js` | Reglas de negocio: crear, asignar y cambiar estado |
| `services/operarios.js` | Rotación del código de verificación del operario |
| `services/errores.js` | Errores de dominio con estado HTTP sugerido |
| `repositories/` | Consultas SQL por dominio (sin lógica HTTP) |
| `lib/db.js` | Pool PostgreSQL compartido y `conTransaccion` |
| `lib/concurrencia.js` | Paralelismo, fallos parciales y límite de tareas |
| `lib/auth.js` | Token, sesión y guards por rol |
| `lib/nit.js` | Derivación del código de operario desde el NIT |
| `lib/oauth.js` | OAuth 2.0 con PKCE, `state` firmado y cookies HttpOnly |
| `lib/eventos.js` | Server-Sent Events (`/api/eventos`) |
| `lib/notificaciones.js` | Persistencia de avisos y destinatarios por rol |
| `lib/limiters.js` | Rate limiting general y de autenticación |
| `lib/mantenimiento.js` | Retención, limpieza de sesiones y rehash de claves |
| `lib/admin-inicial.js` | Creación/actualización del administrador inicial |
| `lib/upload.js` | Multer con `memoryStorage` y validación MIME |
| `lib/almacen.js` | Disco local o Neon Object Storage |
| `lib/security.js` | scrypt, política de contraseñas y tokens |
| `lib/imagenes.js` | Autorización de fotos por dueño, operario o empresa |

Cada router se monta en `server.js` con `app.use('/api', ...)`, de modo
que agregar un dominio nuevo no obliga a editar un archivo gigante.

Guía detallada: [`../docs/ARQUITECTURA.md`](../docs/ARQUITECTURA.md).

## Pruebas

```bash
node --test
```

Las pruebas actuales validan los guards de autenticación, las
utilidades de concurrencia y las funciones de seguridad sin requerir
una base de datos real. Si `npm` está bloqueado por la política de
PowerShell, usa `node --test` directamente o `npm.cmd`.

### Verificación de interfaz y seguridad

Con el servidor en marcha y Chrome o Edge instalado:

```bash
node scripts/verificar-ui.mjs
node scripts/verificar-seguridad.mjs
```

El primer script abre las seis páginas en modo headless, comprueba que no
haya violaciones de CSP ni errores de consola y pulsa las acciones
principales (`data-accion`) de cada panel. Crea la cuenta ciudadana por el
registro público y las cuentas de empresa/operario desde el panel de
administración, porque el autorregistro ya no permite roles
privilegiados. Sus datos de prueba están en
`servidor/.credenciales-demo.local.md` (ignorado por Git).

El segundo verifica la matriz de autorización: registro privilegiado,
segundo factor, bloqueo, tenancy de reportes e imágenes, CORS, caché,
tokens por query y el trigger del código de operario. Solo hace pruebas de
autorización y una transacción con `ROLLBACK`; no borra datos reales.
