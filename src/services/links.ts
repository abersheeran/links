import type { BackgroundContext, CachedLink, LinkRow } from '../types';
import { readCachedLink, writeCachedLink } from '../lib/cache';
import { errorMessage } from '../lib/errors';
import { buildShortUrl } from '../lib/url';

export function toCachedLink(row: LinkRow): CachedLink {
  return {
    id: row.id,
    code: row.code,
    targetUrl: row.target_url,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export async function resolveLink(
  env: Env,
  executionCtx: BackgroundContext,
  tenantId: string,
  code: string,
): Promise<CachedLink | null> {
  const cached = await readCachedLink(env.CACHE, tenantId, code);
  if (cached !== null) {
    return cached;
  }

  const row = await env.DB.prepare(
    `SELECT
       id,
       tenant_id,
       code,
       target_url,
       title,
       description,
       tags,
       status,
       expires_at,
       created_at,
       updated_at
     FROM links
     WHERE tenant_id = ? AND code = ?
     LIMIT 1`,
  )
    .bind(tenantId, code)
    .first<LinkRow>();

  if (row === null) {
    return null;
  }

  const link = toCachedLink(row);
  executionCtx.waitUntil(
    writeCachedLink(env.CACHE, tenantId, link).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: 'cache_write_failed',
          kind: 'link',
          message: errorMessage(error),
        }),
      );
    }),
  );

  return link;
}

export function serializeLink(
  row: LinkRow,
  primaryHostname: string | null,
  publicScheme: string,
) {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((tag): tag is string => typeof tag === 'string');
    }
  } catch {
    tags = [];
  }

  const shortUrl = buildShortUrl(primaryHostname, row.code, publicScheme);

  return {
    id: row.id,
    code: row.code,
    shortUrl,
    targetUrl: row.target_url,
    title: row.title,
    description: row.description,
    tags,
    status: row.status,
    expiresAt:
      row.expires_at === null ? null : new Date(row.expires_at).toISOString(),
    expired: row.expires_at !== null && row.expires_at <= Date.now(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
