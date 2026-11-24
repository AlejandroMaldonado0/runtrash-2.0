-- El NIT único debe identificar a la cuenta de empresa, no a cada
-- operario. Varios operarios de la misma empresa comparten el mismo NIT
-- y el mismo código derivado; la identidad de cada cuenta es el correo.
--
-- La migración 001 creó un índice único global sobre `nit_empresa`, lo
-- que impedía crear el segundo operario de una empresa. Se reemplaza por
-- un índice parcial que solo cubre las cuentas de tipo `empresa`.

DROP INDEX IF EXISTS usuarios_nit_empresa_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_empresa_nit_unique_idx
  ON usuarios (nit_empresa)
  WHERE tipo_usuario = 'empresa'
    AND nit_empresa IS NOT NULL
    AND BTRIM(nit_empresa) <> '';
