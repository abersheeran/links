import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readQuery } from '../lib/http';
import { analyticsQuerySchema } from '../schemas';
import { requirePermission, tenantAuth } from '../middleware/auth';
import { queryAnalytics } from '../services/analytics';

export const analyticsRoutes = new Hono<AppEnv>();

analyticsRoutes.get(
  '/api/v1/analytics',
  tenantAuth,
  requirePermission('analytics:read'),
  async (context) => {
    const query = readQuery(context, analyticsQuerySchema);
    const result = await queryAnalytics(
      context.env,
      context.get('auth').tenantId,
      query,
    );

    return context.json({ data: result });
  },
);
