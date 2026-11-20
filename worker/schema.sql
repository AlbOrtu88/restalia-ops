-- Restalia Operations AI · esquema D1 del backend (idempotente).
CREATE TABLE IF NOT EXISTS records (
  system TEXT NOT NULL,            -- notion | graph
  ref TEXT NOT NULL,               -- id externo (page_id de Notion, id de Graph)
  collection TEXT NOT NULL,        -- colección de la app (locales, tareas, eventos, mensajes...)
  data TEXT NOT NULL,              -- registro ya normalizado al modelo de la app (JSON)
  updated_at TEXT,                 -- source.updatedAt (fecha de modificación en el origen)
  synced_at TEXT NOT NULL,         -- source.syncedAt (cuándo cambió aquí por última vez)
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (system, ref)
);
CREATE INDEX IF NOT EXISTS idx_records_synced ON records(synced_at);
CREATE INDEX IF NOT EXISTS idx_records_col ON records(collection, deleted, updated_at);

CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY, cursor TEXT, last_run TEXT, last_ok TEXT, last_full TEXT,
  last_error TEXT, items INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, source TEXT NOT NULL, trigger TEXT,
  ok INTEGER NOT NULL, items INTEGER DEFAULT 0, ms INTEGER, error TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY, via TEXT NOT NULL, user TEXT, created TEXT NOT NULL, expires TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY, verifier TEXT NOT NULL, scopes TEXT, created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vault (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, action TEXT NOT NULL,
  target TEXT, result TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS schema_cache (collection TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS geocache (
  key TEXT PRIMARY KEY, query TEXT, lat REAL, lng REAL, precision TEXT, display TEXT, status TEXT NOT NULL, fetched_at TEXT NOT NULL
);
