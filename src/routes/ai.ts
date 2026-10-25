import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readJson } from '../lib/http';
import { aiSuggestionInputSchema } from '../schemas';
import { requirePermission, tenantAuth } from '../middleware/auth';
import { suggestLink } from '../services/ai';

export const aiRoutes = new Hono<AppEnv>();

aiRoutes.post(
  '/api/v1/ai/suggest',
  tenantAuth,
  requirePermission('ai:suggest'),
  async (context) => {
    const payload = await readJson(context, aiSuggestionInputSchema);
    const result = await suggestLink(context.env, payload.url);

    return context.json({
      data: {
        ...result.suggestion,
        source: result.source,
      },
    });
  },
);
