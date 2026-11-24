-- Nuevos roles de control y seguimiento de reportes
--
-- Se agregan tres tipos de usuario que supervisan la operación:
--   * distrito  → Alcaldía / Distrito
--   * policia   → Policía
--   * sspd      → Superintendencia de Servicios Públicos Domiciliarios
--
-- Además se crea una tabla de seguimientos para dejar trazabilidad
-- de las observaciones y requerimientos de estos entes.

-- 1. Ampliar el CHECK de tipo_usuario.
ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS usuarios_tipo_usuario_check;

ALTER TABLE usuarios
  ADD CONSTRAINT usuarios_tipo_usuario_check
  CHECK (tipo_usuario IN (
    'ciudadano',
    'operario',
    'empresa',
    'admin',
    'distrito',
    'policia',
    'sspd'
  ));

-- 2. Trazabilidad de seguimientos.
CREATE TABLE IF NOT EXISTS seguimientos_reportes (
  id SERIAL PRIMARY KEY,
  reporte_id INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  ente VARCHAR(20) NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'observacion',
  mensaje VARCHAR(1000) NOT NULL,
  estado_reportado VARCHAR(20),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seguimientos_tipo_check'
  ) THEN
    ALTER TABLE seguimientos_reportes
      ADD CONSTRAINT seguimientos_tipo_check
      CHECK (tipo IN ('observacion', 'requerimiento', 'visita', 'cierre')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seguimientos_ente_check'
  ) THEN
    ALTER TABLE seguimientos_reportes
      ADD CONSTRAINT seguimientos_ente_check
      CHECK (ente IN ('distrito', 'policia', 'sspd', 'admin')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS seguimientos_reporte_fecha_idx
  ON seguimientos_reportes (reporte_id, fecha DESC);
CREATE INDEX IF NOT EXISTS seguimientos_ente_fecha_idx
  ON seguimientos_reportes (ente, fecha DESC);
