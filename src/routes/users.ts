import { Hono } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { isUniqueConstraintError } from '../lib/d1';
import { ApiError } from '../lib/errors';
import { readJson } from '../lib/http';
import { hashPassword } from '../lib/password';
import { nowMs } from '../lib/time';
import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserSchema,
} from '../schemas';
import { requirePermission, tenantAuth } from '../middleware/auth';
import { createTenantUser, serializeUser } from '../services/users';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use(
  '/api/v1/users/*',
  tenantAuth,
  requirePermission('users:manage'),
);
userRoutes.use('/api/v1/users', tenantAuth, requirePermission('users:manage'));

function userSelectSql(): string {
  return `SELECT
    id, tenant_id, email, name, password_hash, role, status,
    failed_login_count, failed_login_window_started_at, locked_until,
    last_login_at, created_at, updated_at
  FROM users`;
}

userRoutes.get('/api/v1/users', async (context) => {
  const auth = context.get('auth');
  const rows = await context.env.DB.prepare(
    `${userSelectSql()}
     WHERE tenant_id = ?
     ORDER BY
       CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
       created_at,
       id`,
  )
    .bind(auth.tenantId)
    .all<UserRow>();

  return context.json({
    data: rows.results.map((row) => ({
      ...serializeUser(row),
      current: row.id === auth.userId,
    })),
  });
});

userRoutes.post('/api/v1/users', async (context) => {
  const auth = context.get('auth');
  const payload = await readJson(context, createUserSchema);

  try {
    const user = await createTenantUser(context.env, auth.tenantId, payload);
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
});

userRoutes.patch('/api/v1/users/:id', async (context) => {
  const auth = context.get('auth');
  const userId = context.req.param('id');
  const payload = await readJson(context, updateUserSchema);
  const target = await context.env.DB.prepare(
    `${userSelectSql()}
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
  )
    .bind(userId, auth.tenantId)
    .first<UserRow>();

  if (target === null) {
    throw new ApiError(404, 'user_not_found', 'User not found.');
  }
  if (target.role === 'owner') {
    throw new ApiError(
      403,
      'owner_immutable',
      'Owner accounts can only be changed by the platform operator.',
    );
  }

  const now = nowMs();
  const assignments = ['updated_at = ?'];
  const values: Array<string | number> = [now];
  if (payload.role !== undefined) {
    assignments.push('role = ?');
    values.push(payload.role);
  }
  if (payload.status !== undefined) {
    assignments.push('status = ?');
    values.push(payload.status);
  }
  values.push(userId, auth.tenantId);

  await context.env.DB.prepare(
    `UPDATE users
     SET ${assignments.join(', ')}
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(...values)
    .run();

  if (payload.status === 'disabled') {
    await context.env.DB.prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`,
    )
      .bind(now, userId, auth.tenantId)
      .run();
  }

  const updated = await context.env.DB.prepare(
    `${userSelectSql()}
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
  )
    .bind(userId, auth.tenantId)
    .first<UserRow>();

  if (updated === null) {
    throw new ApiError(404, 'user_not_found', 'User not found.');
  }

  return context.json({
    data: {
      ...serializeUser(updated),
      current: updated.id === auth.userId,
    },
  });
});

userRoutes.post('/api/v1/users/:id/password', async (context) => {
  const auth = context.get('auth');
  const userId = context.req.param('id');
  const payload = await readJson(context, resetUserPasswordSchema);
  const target = await context.env.DB.prepare(
    'SELECT role FROM users WHERE id = ? AND tenant_id = ? LIMIT 1',
  )
    .bind(userId, auth.tenantId)
    .first<{ role: string }>();

  if (target === null) {
    throw new ApiError(404, 'user_not_found', 'User not found.');
  }
  if (target.role === 'owner') {
    throw new ApiError(
      403,
      'owner_immutable',
      'Owner passwords can only be reset by the platform operator.',
    );
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
    ).bind(await hashPassword(payload.newPassword), now, userId, auth.tenantId),
    context.env.DB.prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`,
    ).bind(now, userId, auth.tenantId),
  ]);

  return context.body(null, 204);
});
