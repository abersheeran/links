PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE tenant_domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK (is_primary IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX tenant_domains_one_primary
  ON tenant_domains(tenant_id)
  WHERE is_primary = 1;

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX api_keys_tenant
  ON api_keys(tenant_id, created_at DESC);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  target_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE INDEX links_tenant_created
  ON links(tenant_id, created_at DESC, id DESC);

CREATE INDEX links_tenant_status
  ON links(tenant_id, status, created_at DESC);
