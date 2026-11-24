-- Codigos de un solo uso para completar el ingreso con Google o Outlook.
--
-- El callback de OAuth no pone el token de sesion en la URL. En su
-- lugar genera un codigo aleatorio de un solo uso, lo guarda hasheado y
-- redirige al frontend con ese codigo. El frontend lo canjea por el
-- token real mediante POST y el codigo queda marcado como usado.

CREATE TABLE IF NOT EXISTS oauth_codigos (
    id SERIAL PRIMARY KEY,
    codigo_hash TEXT NOT NULL UNIQUE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira TIMESTAMPTZ NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    creado TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codigos_expira
    ON oauth_codigos (expira);

COMMENT ON TABLE oauth_codigos IS
  'Codigos temporales de un solo uso emitidos tras un ingreso OAuth.';
