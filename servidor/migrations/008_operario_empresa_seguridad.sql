-- Endurecimiento del vínculo operario–empresa y del inicio de sesión.
--
-- Regla de negocio: el código de operario son los últimos cuatro
-- dígitos del NIT de la empresa (sin puntos ni guiones). Varios
-- operarios de una misma empresa pueden compartir ese código porque la
-- cuenta se identifica por correo; por eso se elimina el índice único
-- global y se reemplaza por un índice compuesto.

-- 1. Contadores de intentos fallidos para bloquear cuentas.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

-- 2. El código de operario deja de ser único a nivel global.
DROP INDEX IF EXISTS usuarios_codigo_operario_unique_idx;

CREATE INDEX IF NOT EXISTS usuarios_empresa_codigo_idx
  ON usuarios (empresa_id, codigo_operario)
  WHERE tipo_usuario = 'operario';

-- 3. Normalizar operarios que ya tienen empresa.
UPDATE usuarios u
SET codigo_operario = RIGHT(regexp_replace(e.nit, '\D', '', 'g'), 4)
FROM empresas e
WHERE u.tipo_usuario = 'operario'
  AND u.empresa_id = e.id
  AND e.nit ~ '\d';

-- 4. Vincular la cuenta demo de la interfaz con su empresa.
--    Es un dato de prueba identificable; los operarios reales sin
--    empresa deben asignarse desde el panel de administración.
UPDATE usuarios u
SET empresa_id = e.id,
    codigo_operario = RIGHT(regexp_replace(e.nit, '\D', '', 'g'), 4)
FROM empresas e
WHERE LOWER(u.correo) = 'ui.operario@runtrash.test'
  AND e.nit = '900123456-7';

-- 5. Asegurar que las cuentas de empresa tengan su empresa asociada.
UPDATE usuarios u
SET empresa_id = e.id
FROM empresas e
WHERE u.tipo_usuario = 'empresa'
  AND u.empresa_id IS NULL
  AND u.nit_empresa = e.nit;

-- 6. Trigger que impide guardar un código distinto al derivado del NIT.
CREATE OR REPLACE FUNCTION validar_codigo_operario()
RETURNS TRIGGER AS $$
DECLARE
  digitos TEXT;
  esperado TEXT;
BEGIN
  IF NEW.tipo_usuario = 'operario' THEN
    IF NEW.empresa_id IS NULL THEN
      RAISE EXCEPTION 'El operario debe estar asociado a una empresa.'
        USING ERRCODE = '23514';
    END IF;

    SELECT regexp_replace(nit, '\D', '', 'g')
      INTO digitos
      FROM empresas
      WHERE id = NEW.empresa_id;

    IF digitos IS NULL OR length(digitos) < 4 THEN
      RAISE EXCEPTION 'El NIT de la empresa no permite derivar el código de operario.'
        USING ERRCODE = '23514';
    END IF;

    esperado := RIGHT(digitos, 4);

    IF NEW.codigo_operario IS DISTINCT FROM esperado THEN
      RAISE EXCEPTION 'El código de operario debe ser los últimos 4 dígitos del NIT.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS usuarios_validar_codigo_operario ON usuarios;

CREATE TRIGGER usuarios_validar_codigo_operario
  BEFORE INSERT OR UPDATE OF codigo_operario, empresa_id, tipo_usuario
  ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION validar_codigo_operario();
