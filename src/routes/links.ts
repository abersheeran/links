import { Hono } from 'hono';
import type { AppEnv, LinkRow } from '../types';
import { randomCode, randomId } from '../lib/crypto';
import { decodeLinkCursor, encodeLinkCursor } from '../lib/cursor';
import { isUniqueConstraintError } from '../lib/d1';
import { ApiError, errorMessage } from '../lib/errors';
import { readJson, readQuery } from '../lib/http';
import { nowMs } from '../lib/time';
import { escapeLike } from '../lib/url';
import { writeCachedLink, deleteCachedLink } from '../lib/cache';
import {
  createLinkSchema,
  listLinksQuerySchema,
  updateLinkSchema,
} from '../schemas';
import { requirePermission, tenantAuth } from '../middleware/auth';
import { serializeLink, toCachedLink } from '../services/links';

export const linkRoutes = new Hono<AppEnv>();

linkRoutes.use('/api/v1/links/*', tenantAuth);
linkRoutes.use('/api/v1/links', tenantAuth);

function linkSelectSql(): string {
  return `SELECT
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
  FROM links`;
}

async function insertLink(env: Env, row: LinkRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO links
       (id, tenant_id, code, target_url, title, description, tags, status,
        expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.tenant_id,
      row.code,
      row.target_url,
      row.title,
      row.description,
      row.tags,
      row.status,
      row.expires_at,
      row.created_at,
      row.updated_at,
    )
    .run();
}

linkRoutes.post(
  '/api/v1/links',
  requirePermission('links:write'),
  async (context) => {
    const auth = context.get('auth');
    const payload = await readJson(context, createLinkSchema);
    const now = nowMs();

    if (payload.expiresAt !== undefined && payload.expiresAt <= now) {
      throw new ApiError(
        422,
        'validation_error',
        '`expiresAt` must be in the future.',
      );
    }

    const row: LinkRow = {
      id: randomId(),
      tenant_id: auth.tenantId,
      code: payload.code ?? '',
      target_url: payload.targetUrl,
      title: payload.title ?? null,
      description: payload.description ?? null,
      tags: JSON.stringify(payload.tags),
      status: 'active',
      expires_at: payload.expiresAt ?? null,
      created_at: now,
      updated_at: now,
    };

    if (payload.code !== undefined) {
      row.code = payload.code;
      try {
        await insertLink(context.env, row);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ApiError(
            409,
            'code_conflict',
            'This short code is already in use by the tenant.',
          );
        }
        throw error;
      }
    } else {
      let inserted = false;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        row.code = randomCode(8);
        try {
          await insertLink(context.env, row);
          inserted = true;
          break;
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error;
          }
        }
      }
      if (!inserted) {
        throw new ApiError(
          503,
          'code_generation_failed',
          'Could not allocate a unique short code. Try again.',
        );
      }
    }

    const cachedLink = toCachedLink(row);
    context.executionCtx.waitUntil(
      writeCachedLink(context.env.CACHE, auth.tenantId, cachedLink).catch(
        (error: unknown) => {
          console.error(
            JSON.stringify({
              event: 'cache_write_failed',
              kind: 'link',
              message: errorMessage(error),
            }),
          );
        },
      ),
    );

    return context.json(
      {
        data: serializeLink(
          row,
          auth.primaryHostname,
          context.env.PUBLIC_SCHEME,
        ),
      },
      201,
    );
  },
);

linkRoutes.get(
  '/api/v1/links',
  requirePermission('links:read'),
  async (context) => {
    const auth = context.get('auth');
    const query = readQuery(context, listLinksQuerySchema);
    const filterConditions = ['tenant_id = ?'];
    const filterValues: Array<string | number> = [auth.tenantId];

    if (query.status !== undefined) {
      filterConditions.push('status = ?');
      filterValues.push(query.status);
    }

    if (query.q !== undefined) {
      const pattern = `%${escapeLike(query.q)}%`;
      filterConditions.push(
        `(code LIKE ? ESCAPE '!' OR COALESCE(title, '') LIKE ? ESCAPE '!' OR target_url LIKE ? ESCAPE '!')`,
      );
      filterValues.push(pattern, pattern, pattern);
    }

    const count = await context.env.DB.prepare(
      `SELECT COUNT(*) AS total
     FROM links
     WHERE ${filterConditions.join(' AND ')}`,
    )
      .bind(...filterValues)
      .first<{ total: number }>();

    const conditions = [...filterConditions];
    const values = [...filterValues];
    if (query.cursor !== undefined) {
      const cursor = decodeLinkCursor(query.cursor);
      conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
      values.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }

    const fetchLimit = query.limit + 1;
    const rows = await context.env.DB.prepare(
      `${linkSelectSql()}
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    )
      .bind(...values, fetchLimit)
      .all<LinkRow>();

    const hasMore = rows.results.length > query.limit;
    const items = rows.results.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor =
      hasMore && last !== undefined
        ? encodeLinkCursor({ createdAt: last.created_at, id: last.id })
        : null;

    return context.json({
      data: items.map((row) =>
        serializeLink(row, auth.primaryHostname, context.env.PUBLIC_SCHEME),
      ),
      pagination: {
        hasMore,
        nextCursor,
        total: count?.total ?? 0,
      },
    });
  },
);

linkRoutes.get(
  '/api/v1/links/:id',
  requirePermission('links:read'),
  async (context) => {
    const auth = context.get('auth');
    const row = await context.env.DB.prepare(
      `${linkSelectSql()}
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    )
      .bind(context.req.param('id'), auth.tenantId)
      .first<LinkRow>();

    if (row === null) {
      throw new ApiError(404, 'link_not_found', 'Short link not found.');
    }

    return context.json({
      data: serializeLink(row, auth.primaryHostname, context.env.PUBLIC_SCHEME),
    });
  },
);

linkRoutes.patch(
  '/api/v1/links/:id',
  requirePermission('links:write'),
  async (context) => {
    const auth = context.get('auth');
    const linkId = context.req.param('id');
    const payload = await readJson(context, updateLinkSchema);
    const now = nowMs();

    if (payload.expiresAt !== undefined && payload.expiresAt !== null) {
      if (payload.expiresAt <= now) {
        throw new ApiError(
          422,
          'validation_error',
          '`expiresAt` must be in the future.',
        );
      }
    }

    const assignments = ['updated_at = ?'];
    const values: Array<string | number | null> = [now];

    if (payload.targetUrl !== undefined) {
      assignments.push('target_url = ?');
      values.push(payload.targetUrl);
    }
    if (payload.title !== undefined) {
      assignments.push('title = ?');
      values.push(payload.title === '' ? null : payload.title);
    }
    if (payload.description !== undefined) {
      assignments.push('description = ?');
      values.push(payload.description === '' ? null : payload.description);
    }
    if (payload.tags !== undefined) {
      assignments.push('tags = ?');
      values.push(JSON.stringify(payload.tags));
    }
    if (payload.status !== undefined) {
      assignments.push('status = ?');
      values.push(payload.status);
    }
    if (payload.expiresAt !== undefined) {
      assignments.push('expires_at = ?');
      values.push(payload.expiresAt);
    }

    values.push(linkId, auth.tenantId);
    const result = await context.env.DB.prepare(
      `UPDATE links
     SET ${assignments.join(', ')}
     WHERE id = ? AND tenant_id = ?`,
    )
      .bind(...values)
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      throw new ApiError(404, 'link_not_found', 'Short link not found.');
    }

    const row = await context.env.DB.prepare(
      `${linkSelectSql()}
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    )
      .bind(linkId, auth.tenantId)
      .first<LinkRow>();

    if (row === null) {
      throw new ApiError(404, 'link_not_found', 'Short link not found.');
    }

    context.executionCtx.waitUntil(
      writeCachedLink(
        context.env.CACHE,
        auth.tenantId,
        toCachedLink(row),
      ).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            event: 'cache_write_failed',
            kind: 'link',
            message: errorMessage(error),
          }),
        );
      }),
    );

    return context.json({
      data: serializeLink(row, auth.primaryHostname, context.env.PUBLIC_SCHEME),
    });
  },
);

linkRoutes.delete(
  '/api/v1/links/:id',
  requirePermission('links:write'),
  async (context) => {
    const auth = context.get('auth');
    const linkId = context.req.param('id');
    const row = await context.env.DB.prepare(
      'SELECT code FROM links WHERE id = ? AND tenant_id = ? LIMIT 1',
    )
      .bind(linkId, auth.tenantId)
      .first<{ code: string }>();

    if (row === null) {
      throw new ApiError(404, 'link_not_found', 'Short link not found.');
    }

    await context.env.DB.prepare(
      'DELETE FROM links WHERE id = ? AND tenant_id = ?',
    )
      .bind(linkId, auth.tenantId)
      .run();

    context.executionCtx.waitUntil(
      deleteCachedLink(context.env.CACHE, auth.tenantId, row.code).catch(
        (error: unknown) => {
          console.error(
            JSON.stringify({
              event: 'cache_delete_failed',
              kind: 'link',
              message: errorMessage(error),
            }),
          );
        },
      ),
    );

    return context.body(null, 204);
  },
);
