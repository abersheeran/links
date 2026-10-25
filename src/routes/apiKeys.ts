import { Hono } from 'hono';
import type { AppEnv, ApiKeyMetadataRow } from '../types';
import { generateApiKey, randomId } from '../lib/crypto';
import { ApiError } from '../lib/errors';
import { readJson } from '../lib/http';
import { nowMs, toIso } from '../lib/time';
import { createApiKeySchema } from '../schemas';
import { requirePermission, tenantAuth } from '../middleware/auth';

export const apiKeyRoutes = new Hono<AppEnv>();

apiKeyRoutes.use(
  '/api/v1/api-keys/*',
  tenantAuth,
  requirePermission('api_keys:manage'),
);
apiKeyRoutes.use(
  '/api/v1/api-keys',
  tenantAuth,
  requirePermission('api_keys:manage'),
);

apiKeyRoutes.post('/api/v1/api-keys', async (context) => {
  const auth = context.get('auth');
  const payload = await readJson(context, createApiKeySchema);
  const id = randomId();
  const now = nowMs();
  const generated = await generateApiKey();

  await context.env.DB.prepare(
    `INSERT INTO api_keys
       (id, tenant_id, name, prefix, key_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      auth.tenantId,
      payload.name,
      generated.prefix,
      generated.hash,
      now,
    )
    .run();

  return context.json(
    {
      data: {
        id,
        name: payload.name,
        prefix: generated.prefix,
        token: generated.token,
        createdAt: new Date(now).toISOString(),
      },
    },
    201,
  );
});

apiKeyRoutes.get('/api/v1/api-keys', async (context) => {
  const auth = context.get('auth');
  const rows = await context.env.DB.prepare(
    `SELECT id, name, prefix, created_at, last_used_at, revoked_at
     FROM api_keys
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
  )
    .bind(auth.tenantId)
    .all<ApiKeyMetadataRow>();

  return context.json({
    data: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      current: row.id === auth.apiKeyId,
      createdAt: toIso(row.created_at),
      lastUsedAt: toIso(row.last_used_at),
      revokedAt: toIso(row.revoked_at),
    })),
  });
});

apiKeyRoutes.delete('/api/v1/api-keys/:id', async (context) => {
  const auth = context.get('auth');
  const keyId = context.req.param('id');
  const now = nowMs();

  const result = await context.env.DB.prepare(
    `UPDATE api_keys
     SET revoked_at = ?
     WHERE id = ?
       AND tenant_id = ?
       AND revoked_at IS NULL
       AND EXISTS (
         SELECT 1
         FROM api_keys other
         WHERE other.tenant_id = ?
           AND other.revoked_at IS NULL
           AND other.id <> ?
       )`,
  )
    .bind(now, keyId, auth.tenantId, auth.tenantId, keyId)
    .run();

  if ((result.meta.changes ?? 0) > 0) {
    return context.body(null, 204);
  }

  const existing = await context.env.DB.prepare(
    'SELECT revoked_at FROM api_keys WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(keyId, auth.tenantId)
    .first<{ revoked_at: number | null }>();

  if (existing === null) {
    throw new ApiError(404, 'api_key_not_found', 'API key not found.');
  }
  if (existing.revoked_at !== null) {
    return context.body(null, 204);
  }

  throw new ApiError(
    409,
    'last_api_key',
    'Create another active API key before revoking the last one.',
  );
});
