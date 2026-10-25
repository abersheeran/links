import type {
  BackgroundContext,
  CachedTenant,
  TenantRow,
  TenantStatus,
} from '../types';
import { readCachedTenant, writeCachedTenant } from '../lib/cache';
import { errorMessage } from '../lib/errors';

interface TenantLookupRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  primary_hostname: string | null;
}

export async function resolveTenantByHost(
  env: Env,
  executionCtx: BackgroundContext,
  hostname: string,
): Promise<CachedTenant | null> {
  const cached = await readCachedTenant(env.CACHE, hostname);
  if (cached !== null) {
    return cached;
  }

  const row = await env.DB.prepare(
    `SELECT
       t.id,
       t.name,
       t.slug,
       t.status,
       (
         SELECT d2.hostname
         FROM tenant_domains d2
         WHERE d2.tenant_id = t.id AND d2.is_primary = 1
         LIMIT 1
       ) AS primary_hostname
     FROM tenant_domains d
     JOIN tenants t ON t.id = d.tenant_id
     WHERE d.hostname = ?
     LIMIT 1`,
  )
    .bind(hostname)
    .first<TenantLookupRow>();

  if (row === null) {
    return null;
  }

  const tenant: CachedTenant = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    primaryHostname: row.primary_hostname,
  };

  executionCtx.waitUntil(
    writeCachedTenant(env.CACHE, hostname, tenant).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: 'cache_write_failed',
          kind: 'tenant',
          message: errorMessage(error),
        }),
      );
    }),
  );

  return tenant;
}

export async function getTenantById(
  env: Env,
  tenantId: string,
): Promise<TenantRow | null> {
  return env.DB.prepare(
    `SELECT
       t.id,
       t.name,
       t.slug,
       t.status,
       t.created_at,
       t.updated_at,
       (
         SELECT d.hostname
         FROM tenant_domains d
         WHERE d.tenant_id = t.id AND d.is_primary = 1
         LIMIT 1
       ) AS primary_hostname
     FROM tenants t
     WHERE t.id = ?
     LIMIT 1`,
  )
    .bind(tenantId)
    .first<TenantRow>();
}
