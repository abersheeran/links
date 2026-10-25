import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { ApiError } from '../lib/errors';
import { toIso } from '../lib/time';
import { tenantAuth } from '../middleware/auth';
import { getTenantById } from '../services/tenants';

export const meRoutes = new Hono<AppEnv>();

meRoutes.get('/api/v1/me', tenantAuth, async (context) => {
  const auth = context.get('auth');
  const tenant = await getTenantById(context.env, auth.tenantId);
  if (tenant === null) {
    throw new ApiError(404, 'tenant_not_found', 'Tenant not found.');
  }

  return context.json({
    data: {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        primaryHostname: tenant.primary_hostname,
        createdAt: toIso(tenant.created_at),
        updatedAt: toIso(tenant.updated_at),
      },
      permissions: auth.permissions,
      actor:
        auth.kind === 'session'
          ? {
              type: 'user',
              id: auth.userId,
              name: auth.userName,
              email: auth.userEmail,
              role: auth.role,
            }
          : {
              type: 'api_key',
              id: auth.apiKeyId,
            },
    },
  });
});
