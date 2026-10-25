import type { CachedLink, CachedTenant } from '../types';
import { errorMessage } from './errors';

const tenantTtlSeconds = 60;
const linkTtlSeconds = 60;

function tenantKey(hostname: string): string {
  return `v1:host:${hostname}`;
}

function linkKey(tenantId: string, code: string): string {
  return `v1:link:${tenantId}:${code}`;
}

export async function readCachedTenant(
  cache: KVNamespace,
  hostname: string,
): Promise<CachedTenant | null> {
  try {
    return await cache.get<CachedTenant>(tenantKey(hostname), 'json');
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'cache_read_failed',
        kind: 'tenant',
        message: errorMessage(error),
      }),
    );
    return null;
  }
}

export async function writeCachedTenant(
  cache: KVNamespace,
  hostname: string,
  tenant: CachedTenant,
): Promise<void> {
  await cache.put(tenantKey(hostname), JSON.stringify(tenant), {
    expirationTtl: tenantTtlSeconds,
  });
}

export async function readCachedLink(
  cache: KVNamespace,
  tenantId: string,
  code: string,
): Promise<CachedLink | null> {
  try {
    return await cache.get<CachedLink>(linkKey(tenantId, code), 'json');
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'cache_read_failed',
        kind: 'link',
        message: errorMessage(error),
      }),
    );
    return null;
  }
}

export async function writeCachedLink(
  cache: KVNamespace,
  tenantId: string,
  link: CachedLink,
): Promise<void> {
  await cache.put(linkKey(tenantId, link.code), JSON.stringify(link), {
    expirationTtl: linkTtlSeconds,
  });
}

export async function deleteCachedLink(
  cache: KVNamespace,
  tenantId: string,
  code: string,
): Promise<void> {
  await cache.delete(linkKey(tenantId, code));
}
