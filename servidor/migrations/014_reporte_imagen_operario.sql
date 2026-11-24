-- Foto de evidencia que adjunta el operario al completar un reporte.
--
-- `imagen_url` conserva la foto del ciudadano que reportó el residuo.
-- `imagen_operario_url` guarda la foto del operario al momento de
-- completar (evidencia de recolección). Con esto el panel puede mostrar
-- ambas fotos: la del ciudadano y la del operario.

ALTER TABLE reportes
  ADD COLUMN IF NOT EXISTS imagen_operario_url VARCHAR(500);

COMMENT ON COLUMN reportes.imagen_operario_url IS
  'Ruta de la foto que adjunta el operario al completar el reporte (/uploads/...). Es la evidencia de la recoleccion.';
