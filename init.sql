-- init.sql
-- 幂等建表脚本，容器首次启动时自动执行

CREATE TABLE IF NOT EXISTS print_records (
  id                  SERIAL PRIMARY KEY,
  makerworld_url      TEXT NOT NULL,
  model_name          TEXT,
  model_id            TEXT,
  thumbnail_url       TEXT,
  designer_name       TEXT,
  designer_avatar_url TEXT,
  filament_grams      NUMERIC(8,2) NOT NULL,
  colors              TEXT[],
  print_time_minutes  INTEGER,
  tags                TEXT[],
  raw_meta            JSONB,
  note                TEXT,
  instance_id         TEXT,
  instance_title      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 为已存在的表补充字段（幂等）
ALTER TABLE print_records ADD COLUMN IF NOT EXISTS instance_id TEXT;
ALTER TABLE print_records ADD COLUMN IF NOT EXISTS instance_title TEXT;

CREATE TABLE IF NOT EXISTS quota_records (
  id         SERIAL PRIMARY KEY,
  delta      NUMERIC(8,2) NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 清理过期 session（可选，防止表无限增长）
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions (expires_at);
