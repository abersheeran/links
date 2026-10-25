import { Hono } from 'hono';
import type { AppEnv, CachedTenant, TenantStatus } from '../types';
import { generateApiKey, randomId } from '../lib/crypto';
import { isUniqueConstraintError } from '../lib/d1';
import { ApiError, errorMessage } from '../lib/errors';
import { readJson } from '../lib/http';
import { hashPassword } from '../lib/password';
import { nowMs, toIso } from '../lib/time';
import { writeCachedTenant } from '../lib/cache';
import {
  createApiKeySchema,
  createPlatformUserSchema,
  createTenantSchema,
  resetUserPasswordSchema,
} from '../schemas';
import { bootstrapAuth } from '../middleware/auth';
import { createTenantUser, serializeUser } from '../services/users';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post('/api/v1/admin/tenants', bootstrapAuth, async (context) => {
  const payload = await readJson(context, createTenantSchema);
  const now = nowMs();
  const tenantId = randomId();
  const domainId = randomId();
  const apiKeyId = randomId();
  const apiKey = await generateApiKey();
  const ownerId = payload.owner === undefined ? null : randomId();
  const ownerHash =
    payload.owner === undefined
      ? null
      : await hashPassword(payload.owner.password);

  try {
    const statements = [
      context.env.DB.prepare(
        `INSERT INTO tenants
             (id, name, slug, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?)`,
      ).bind(tenantId, payload.name, payload.slug, now, now),
      context.env.DB.prepare(
        `INSERT INTO tenant_domains
             (id, tenant_id, hostname, is_primary, created_at)
           VALUES (?, ?, ?, 1, ?)`,
      ).bind(domainId, tenantId, payload.hostname, now),
      context.env.DB.prepare(
        `INSERT INTO api_keys
             (id, tenant_id, name, prefix, key_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        apiKeyId,
        tenantId,
        payload.apiKeyName,
        apiKey.prefix,
        apiKey.hash,
        now,
      ),
    ];

    if (payload.owner !== undefined && ownerId !== null && ownerHash !== null) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO users
               (id, tenant_id, email, name, password_hash, role, status,
                failed_login_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'owner', 'active', 0, ?, ?)`,
        ).bind(
          ownerId,
          tenantId,
          payload.owner.email,
          payload.owner.name,
          ownerHash,
          now,
          now,
        ),
      );
    }

    await context.env.DB.batch(statements);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      if (/users\.email/iu.test(errorMessage(error))) {
        throw new ApiError(
          409,
          'email_conflict',
          'The owner email is already in use in this tenant.',
        );
      }
      throw new ApiError(
        409,
        'tenant_conflict',
        'The tenant slug or hostname is already in use.',
      );
    }
    throw error;
  }

  const cachedTenant: CachedTenant = {
    id: tenantId,
    name: payload.name,
    slug: payload.slug,
    status: 'active',
    primaryHostname: payload.hostname,
  };
  context.executionCtx.waitUntil(
    writeCachedTenant(context.env.CACHE, payload.hostname, cachedTenant).catch(
      (error: unknown) => {
        console.error(
          JSON.stringify({
            event: 'cache_write_failed',
            kind: 'tenant',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      },
    ),
  );

  return context.json(
    {
      data: {
        tenant: {
          id: tenantId,
          name: payload.name,
          slug: payload.slug,
          status: 'active',
          hostname: payload.hostname,
          createdAt: new Date(now).toISOString(),
        },
        apiKey: {
          id: apiKeyId,
          name: payload.apiKeyName,
          prefix: apiKey.prefix,
          token: apiKey.token,
          createdAt: new Date(now).toISOString(),
        },
        ...(payload.owner === undefined || ownerId === null
          ? {}
          : {
              owner: {
                id: ownerId,
                name: payload.owner.name,
                email: payload.owner.email,
                role: 'owner',
                status: 'active',
                createdAt: new Date(now).toISOString(),
              },
            }),
      },
    },
    201,
  );
});

adminRoutes.post(
  '/api/v1/admin/tenants/:tenantId/users',
  bootstrapAuth,
  async (context) => {
    const tenantId = context.req.param('tenantId');
    const payload = await readJson(context, createPlatformUserSchema);
    const tenant = await context.env.DB.prepare(
      'SELECT id FROM tenants WHERE id = ? LIMIT 1',
    )
      .bind(tenantId)
      .first<{ id: string }>();

    if (tenant === null) {
      throw new ApiError(404, 'tenant_not_found', 'Tenant not found.');
    }

    try {
      const user = await createTenantUser(context.env, tenantId, payload);
      return context.json(
        {
          data: serializeUser(user),
        },
        201,
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApiError(
          409,
          'email_conflict',
          'This email is already used by another user in the tenant.',
        );
      }
      throw error;
    }
  },
);

adminRoutes.post(
  '/api/v1/admin/tenants/:tenantId/users/:userId/password',
  bootstrapAuth,
  async (context) => {
    const tenantId = context.req.param('tenantId');
    const userId = context.req.param('userId');
    const payload = await readJson(context, resetUserPasswordSchema);
    const user = await context.env.DB.prepare(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(userId, tenantId)
      .first<{ id: string }>();

    if (user === null) {
      throw new ApiError(404, 'user_not_found', 'User not found.');
    }

    const now = nowMs();
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE users
         SET password_hash = ?,
             failed_login_count = 0,
             failed_login_window_started_at = NULL,
             locked_until = NULL,
             updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
      ).bind(await hashPassword(payload.newPassword), now, userId, tenantId),
      context.env.DB.prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`,
      ).bind(now, userId, tenantId),
    ]);

    return context.body(null, 204);
  },
);

adminRoutes.get('/api/v1/admin/tenants', bootstrapAuth, async (context) => {
  const rows = await context.env.DB.prepare(
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
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 100`,
  ).all<{
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
    created_at: number;
    updated_at: number;
    primary_hostname: string | null;
  }>();

  return context.json({
    data: rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      primaryHostname: row.primary_hostname,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    })),
  });
});

adminRoutes.post(
  '/api/v1/admin/tenants/:tenantId/api-keys',
  bootstrapAuth,
  async (context) => {
    const tenantId = context.req.param('tenantId');
    const payload = await readJson(context, createApiKeySchema);
    const tenant = await context.env.DB.prepare(
      'SELECT id FROM tenants WHERE id = ? LIMIT 1',
    )
      .bind(tenantId)
      .first<{ id: string }>();

    if (tenant === null) {
      throw new ApiError(404, 'tenant_not_found', 'Tenant not found.');
    }

    const keyId = randomId();
    const generated = await generateApiKey();
    const now = nowMs();
    await context.env.DB.prepare(
      `INSERT INTO api_keys
         (id, tenant_id, name, prefix, key_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        keyId,
        tenantId,
        payload.name,
        generated.prefix,
        generated.hash,
        now,
      )
      .run();

    return context.json(
      {
        data: {
          id: keyId,
          name: payload.name,
          prefix: generated.prefix,
          token: generated.token,
          createdAt: new Date(now).toISOString(),
        },
      },
      201,
    );
  },
);
