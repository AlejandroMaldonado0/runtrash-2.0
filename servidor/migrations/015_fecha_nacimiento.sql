-- =========================================================
-- Fecha de nacimiento del usuario.
-- Se guarda durante el registro para el mensaje de
-- cumpleaños en la bienvenida de RunTrash.
-- =========================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;

COMMENT ON COLUMN usuarios.fecha_nacimiento IS
    'Fecha de nacimiento del usuario; se usa para el mensaje de cumpleaños en la bienvenida.';
