-- Foto de perfil personalizable.
--
-- El avatar se guarda como data URL ya recortada y reducida por el
-- navegador (cuadrado de 256 px en WEBP). Así no hace falta una ruta
-- pública nueva: la imagen viaja en el objeto de usuario y se muestra
-- solo a su dueño. El servidor valida formato y tamaño antes de
-- escribirla.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN usuarios.avatar_url IS
  'Data URL de la foto de perfil (WEBP/PNG/JPEG cuadrado, máximo 400 KB).';
