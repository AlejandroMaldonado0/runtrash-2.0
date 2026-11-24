-- Cuentas de demostracion para los paneles de control y administracion.
--
-- ADVERTENCIA: estas cuentas usan contrasenas conocidas y estan pensadas
-- solo para entornos locales o demostraciones. El ejecutor de migraciones
-- las omite en produccion salvo que se defina SEED_DEMO_ACCOUNTS=true.
--
-- Las credenciales de prueba no se guardan en este archivo versionado.
-- Estan en `servidor/.credenciales-demo.local.md`, que esta ignorado por
-- Git. Si ese archivo no existe, restablece las contrasenas desde el panel
-- de administracion o vuelve a sembrar las cuentas en local.
--
-- La migracion es idempotente: si la cuenta ya existe, restaura su
-- contrasena, rol y estado activo; si no existe, la crea.

DO $$
BEGIN
  -- distrito@runtrash.test
  IF EXISTS (SELECT 1 FROM usuarios WHERE LOWER(correo) = 'distrito@runtrash.test') THEN
    UPDATE usuarios
    SET nombre = 'Distrito Prueba',
        password = 'scrypt$fd1375dde7ae4a7ad7d21bb92c55562b$5f0c03ee9537bdae5b0adcd15cf586016f36637f30c67c97979485b192b4e6b689f1a44e7cb7e0cf4680af5425f679914451461914d56dea1ebc517006019bfa',
        tipo_usuario = 'distrito',
        activo = TRUE
    WHERE LOWER(correo) = 'distrito@runtrash.test';
  ELSE
    INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
    VALUES ('Distrito Prueba', 'distrito@runtrash.test', 'scrypt$fd1375dde7ae4a7ad7d21bb92c55562b$5f0c03ee9537bdae5b0adcd15cf586016f36637f30c67c97979485b192b4e6b689f1a44e7cb7e0cf4680af5425f679914451461914d56dea1ebc517006019bfa', 'distrito', TRUE);
  END IF;

  -- policia@runtrash.test
  IF EXISTS (SELECT 1 FROM usuarios WHERE LOWER(correo) = 'policia@runtrash.test') THEN
    UPDATE usuarios
    SET nombre = 'Policia Prueba',
        password = 'scrypt$f7a568ff0eef9a00393864408ec6c708$a48ecf03ab4bfbbc07a9a4d3196eadb411cf78c8c263f24d6cefcc045e3787ffb72b5598896f0d4e75db7bb9ed6251b3ee496007adac9d3a1401ef8afc4af3fb',
        tipo_usuario = 'policia',
        activo = TRUE
    WHERE LOWER(correo) = 'policia@runtrash.test';
  ELSE
    INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
    VALUES ('Policia Prueba', 'policia@runtrash.test', 'scrypt$f7a568ff0eef9a00393864408ec6c708$a48ecf03ab4bfbbc07a9a4d3196eadb411cf78c8c263f24d6cefcc045e3787ffb72b5598896f0d4e75db7bb9ed6251b3ee496007adac9d3a1401ef8afc4af3fb', 'policia', TRUE);
  END IF;

  -- sspd@runtrash.test
  IF EXISTS (SELECT 1 FROM usuarios WHERE LOWER(correo) = 'sspd@runtrash.test') THEN
    UPDATE usuarios
    SET nombre = 'SSPD Prueba',
        password = 'scrypt$5b51479963a734ff19b409f35ca81680$3ff7c1cf008cbd1c7606f0640b4bf2fe8ac66230b1de36eeaf0f9632da9cd51c93fad47c518e4d27039449ff3b117714bcdf60db59f1742bedb4ce45a0032afb',
        tipo_usuario = 'sspd',
        activo = TRUE
    WHERE LOWER(correo) = 'sspd@runtrash.test';
  ELSE
    INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
    VALUES ('SSPD Prueba', 'sspd@runtrash.test', 'scrypt$5b51479963a734ff19b409f35ca81680$3ff7c1cf008cbd1c7606f0640b4bf2fe8ac66230b1de36eeaf0f9632da9cd51c93fad47c518e4d27039449ff3b117714bcdf60db59f1742bedb4ce45a0032afb', 'sspd', TRUE);
  END IF;

  -- admin.prueba@runtrash.test
  IF EXISTS (SELECT 1 FROM usuarios WHERE LOWER(correo) = 'admin.prueba@runtrash.test') THEN
    UPDATE usuarios
    SET nombre = 'Administrador Prueba',
        password = 'scrypt$23baccf26c8146ce9dc9fe178ea391c3$6e05c42df50f1a846ee67778475afb34d93ee0cb5de1ae20eeebb2d9fe6d7fd32374a195a86a05cb8c52b7298cabbc4c0266ddbe9e84525130aefdad33bc28a0',
        tipo_usuario = 'admin',
        activo = TRUE
    WHERE LOWER(correo) = 'admin.prueba@runtrash.test';
  ELSE
    INSERT INTO usuarios (nombre, correo, password, tipo_usuario, activo)
    VALUES ('Administrador Prueba', 'admin.prueba@runtrash.test', 'scrypt$23baccf26c8146ce9dc9fe178ea391c3$6e05c42df50f1a846ee67778475afb34d93ee0cb5de1ae20eeebb2d9fe6d7fd32374a195a86a05cb8c52b7298cabbc4c0266ddbe9e84525130aefdad33bc28a0', 'admin', TRUE);
  END IF;
END $$;
