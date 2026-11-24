-- Cuentas de demostracion de la interfaz (`ui.*`).
--
-- ADVERTENCIA: usan una contrasena conocida. El ejecutor de migraciones
-- las omite en produccion salvo que se defina SEED_DEMO_ACCOUNTS=true,
-- y si el flag no esta activo tambien desactiva cualquier cuenta
-- terminada en @runtrash.test.
--
-- Credenciales (cambialas desde el panel cuando termine la demo):
--   ui.ciudadano@runtrash.test / UiTest2026!
--   ui.empresa@runtrash.test   / UiTest2026! / NIT 900123456-7
--   ui.operario@runtrash.test  / UiTest2026! / codigo 4567
--   codigo de verificacion del operario: 650721

INSERT INTO empresas (nombre, nit, correo)
VALUES ('UI Empresa', '900123456-7', 'ui.empresa@runtrash.test')
ON CONFLICT (nit) DO UPDATE
SET nombre = EXCLUDED.nombre,
    correo = EXCLUDED.correo;

INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
VALUES (
  'UI Ciudadano',
  'ui.ciudadano@runtrash.test',
  'scrypt$6c4a9dcadffb2badf183dbc39bddf90e$b77798d8a4f24a5eeb0288ed29fc33f4458216faf95cb24a8fb1772904ade28e4ac9aa9fe429fc4e8b74bf3efcfc02a04aba2c8df555f8c2870464e14a5bd520',
  'ciudadano',
  TRUE
)
ON CONFLICT (correo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    password = EXCLUDED.password,
    tipo_usuario = 'ciudadano',
    empresa_id = NULL,
    nit_empresa = NULL,
    codigo_operario = NULL,
    codigo_verificacion_hash = NULL,
    codigo_verificacion_creado = NULL,
    activo = TRUE;

INSERT INTO usuarios (
  nombre, correo, password, tipo_usuario, nit_empresa, empresa_id, activo
)
SELECT
  'UI Empresa',
  'ui.empresa@runtrash.test',
  'scrypt$ac65e1cff5c89ca4eb5c737d64c3b8e1$fb22cd6af089dd4d74c01a713be79b6005ac2f663be7fa3df593a3892c477970478858080f518028aaecffa3a09eb3d9c591976f892a30cc7efd6412829c1651',
  'empresa',
  '900123456-7',
  e.id,
  TRUE
FROM empresas e
WHERE e.nit = '900123456-7'
ON CONFLICT (correo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    password = EXCLUDED.password,
    tipo_usuario = 'empresa',
    nit_empresa = EXCLUDED.nit_empresa,
    empresa_id = EXCLUDED.empresa_id,
    codigo_operario = NULL,
    codigo_verificacion_hash = NULL,
    codigo_verificacion_creado = NULL,
    activo = TRUE;

INSERT INTO usuarios (
  nombre, correo, password, tipo_usuario, nit_empresa, empresa_id,
  codigo_operario, zona_asignada, activo,
  codigo_verificacion_hash, codigo_verificacion_creado
)
SELECT
  'UI Operario',
  'ui.operario@runtrash.test',
  'scrypt$0a18f79e55f7dc7ce78d98626ced1c95$a4a362013191bce5c8bd4b23fdecdb52c9b5dc511be967733ab98e17ed4b5b22a0d92366b0912f4930ba39f423d9e08d6a2e6b718f0e12ec2c53a696dfef1c15',
  'operario',
  '900123456-7',
  e.id,
  RIGHT(regexp_replace(e.nit, '\D', '', 'g'), 4),
  'Usaquén',
  TRUE,
  'scrypt$1b01f2f60925e3740485ef5fd1d5566d$c49ac9519f1f86bce658d062fdcc1d85f71edca50d6ff3eb1cd247a7e592dd6a5a142de415479d70f9d57d4dc772766f68632bc3114a92c3df7ea25c091cf695',
  NOW()
FROM empresas e
WHERE e.nit = '900123456-7'
ON CONFLICT (correo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    password = EXCLUDED.password,
    tipo_usuario = 'operario',
    nit_empresa = EXCLUDED.nit_empresa,
    empresa_id = EXCLUDED.empresa_id,
    codigo_operario = EXCLUDED.codigo_operario,
    zona_asignada = EXCLUDED.zona_asignada,
    activo = TRUE,
    codigo_verificacion_hash = EXCLUDED.codigo_verificacion_hash,
    codigo_verificacion_creado = EXCLUDED.codigo_verificacion_creado;
