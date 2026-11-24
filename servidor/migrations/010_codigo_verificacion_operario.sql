-- Codigo de verificacion adicional para operarios.
--
-- La empresa (o un administrador) genera un codigo numerico de seis
-- digitos para cada operario y se lo entrega. El login del operario
-- exige ese codigo ademas del codigo derivado del NIT de la empresa.
--
-- Se guarda solo el hash scrypt, igual que las contrasenas. La empresa
-- puede generar uno nuevo en cualquier momento; al hacerlo se revocan
-- las sesiones abiertas del operario.
--
-- Las cuentas existentes quedan con NULL para no bloquear su ingreso:
-- el segundo codigo se exige a partir de la primera generacion.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS codigo_verificacion_hash TEXT;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS codigo_verificacion_creado TIMESTAMPTZ;

COMMENT ON COLUMN usuarios.codigo_verificacion_hash IS
  'Hash scrypt del codigo de verificacion entregado por la empresa al operario.';

COMMENT ON COLUMN usuarios.codigo_verificacion_creado IS
  'Fecha en que la empresa genero por ultima vez el codigo de verificacion.';
