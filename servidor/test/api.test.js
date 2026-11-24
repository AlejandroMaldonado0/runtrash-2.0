/**
 * @file Pruebas de autenticación y permisos de la API.
 *
 * Comprueba que los endpoints protegidos respondan 401 sin sesión y que
 * los guards de rol rechacen accesos indebidos.
 *
 * @module test/api
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/*
La prueba de OAuth comprueba el comportamiento sin credenciales ni
modo demo. Se fija antes de cargar el servidor para que `.env` no lo
active durante las pruebas.
*/
process.env.OAUTH_DEMO = '0';

const request = require('supertest');
const app = require('../server');

test('los endpoints de reportes exigen una sesión', async () => {
  const response = await request(app).get('/api/reportes');
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test('el endpoint de crear reporte rechaza usuarios sin sesión', async () => {
  const response = await request(app).post('/api/reportes');
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test('los endpoints de control exigen una sesión', async () => {
  const resumen = await request(app).get('/api/control/resumen');
  assert.equal(resumen.status, 401);
  assert.equal(resumen.body.ok, false);

  const listado = await request(app).get('/api/control/reportes');
  assert.equal(listado.status, 401);
  assert.equal(listado.body.ok, false);
});

test('el login valida los campos antes de consultar la base', async () => {
  const response = await request(app).post('/api/login').send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
});

test('OAuth informa proveedores no configurados y no abre el flujo', async () => {
  const lista = await request(app).get('/api/auth/oauth/proveedores');
  assert.equal(lista.status, 200);
  assert.deepEqual(
    lista.body.proveedores.map((item) => item.id).sort(),
    ['google', 'microsoft']
  );

  const inicio = await request(app).get('/api/auth/oauth/google/iniciar');
  assert.equal(inicio.status, 302);
  assert.match(inicio.headers.location, /oauth_error=sin_configurar/);
});

test('el resumen del perfil y la foto exigen una sesión', async () => {
  const resumen = await request(app).get('/api/perfil/resumen');
  assert.equal(resumen.status, 401);
  assert.equal(resumen.body.ok, false);

  const avatar = await request(app)
    .put('/api/perfil/avatar')
    .send({ avatar: null });
  assert.equal(avatar.status, 401);
  assert.equal(avatar.body.ok, false);
});

test('el centro de notificaciones exige una sesión', async () => {
  const response = await request(app).get('/api/notificaciones');
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test('el registro valida los campos obligatorios', async () => {
  const response = await request(app).post('/api/registro').send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
});

test('las imágenes de reportes exigen una sesión', async () => {
  const response = await request(app).get('/uploads/2026/01/foto.jpg');
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

test('los archivos de configuración y secretos no se sirven', async () => {
  const raiz = await request(app).get('/.env');
  assert.equal(raiz.status, 404);

  const interno = await request(app).get('/servidor/.env');
  assert.equal(interno.status, 404);

  const migracion = await request(app).get('/servidor/migrations/001_postgres_schema.sql');
  assert.equal(migracion.status, 404);
});

test('la API desactiva la caché de respuestas con datos de sesión', async () => {
  const response = await request(app).get('/api/notificaciones');
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('CORS no refleja orígenes no autorizados', async () => {
  const response = await request(app)
    .get('/api/notificaciones')
    .set('Origin', 'https://evil.example');

  assert.equal(response.status, 403);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('el token de sesión no se acepta por query fuera de SSE e imágenes', async () => {
  const response = await request(app).get('/api/me?token=token-de-prueba');
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
});

