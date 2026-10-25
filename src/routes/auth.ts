import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, UserRow } from '../types';
import { ApiError, errorMessage } from '../lib/errors';
import { readJson } from '../lib/http';
import {
  burnPasswordCheck,
  hashPassword,
  verifyPassword,
} from '../lib/password';
import {
  createSession,
  hashSessionToken,
  sessionCookieName,
  sessionTtlMs,
} from '../lib/session';
import { nowMs } from '../lib/time';
import { changePasswordSchema, loginSchema } from '../schemas';
import { assertSameOrigin, sessionAuth } from '../middleware/auth';
import { resolveTenantByHost } from '../services/tenants';
import { sessionPayload } from '../services/auth';
import { serializeUser } from '../services/users';
import { permissionsForRole } from '../../shared/permissions';

const failedLoginWindowMs = 15 * 60 * 1000;
const loginLockMs = 15 * 60 * 1000;
const maxFailedLogins = 5;

export const authRoutes = new Hono<AppEnv>();

function sessionCookieOptions(requestUrl: string) {
  return {
    httpOnly: true,
    secure: new URL(requestUrl).protocol === 'https:',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: Math.floor(sessionTtlMs / 1000),
  };
}

async function findUserByEmail(
  env: Env,
  tenantId: string,
  email: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    `SELECT
       id, tenant_id, email, name, password_hash, role, status,
       failed_login_count, failed_login_window_started_at, locked_until,
       last_login_at, created_at, updated_at
     FROM users
     WHERE tenant_id = ? AND email = ?
     LIMIT 1`,
  )
    .bind(tenantId, email)
    .first<UserRow>();
}

authRoutes.post('/api/v1/auth/login', async (context) => {
  assertSameOrigin(context);
  const payload = await readJson(context, loginSchema);
  const hostname = new URL(context.req.url).host.toLowerCase();
  const tenant = await resolveTenantByHost(
    context.env,
    context.executionCtx,
    hostname,
  );

  if (tenant === null) {
    throw new ApiError(
      404,
      'tenant_not_found',
      'This domain is not linked to any tenant.',
    );
  }
  if (tenant.status !== 'active') {
    throw new ApiError(403, 'tenant_suspended', 'This tenant is suspended.');
  }

  const user = await findUserByEmail(context.env, tenant.id, payload.email);
  if (user === null) {
    await burnPasswordCheck(payload.password);
    throw new ApiError(
      401,
      'invalid_credentials',
      'Email or password is incorrect.',
    );
  }
  if (user.status !== 'active') {
    throw new ApiError(403, 'user_disabled', 'This user account is disabled.');
  }

  const now = nowMs();
  if (user.locked_until !== null && user.locked_until > now) {
    throw new ApiError(
      429,
      'login_locked',
      'Too many failed attempts. Try again later.',
      { retryAfterSeconds: Math.ceil((user.locked_until - now) / 1000) },
    );
  }

  const passwordValid = await verifyPassword(
    payload.password,
    user.password_hash,
  );
  if (!passwordValid) {
    const windowStarted = user.failed_login_window_started_at;
    const inWindow =
      windowStarted !== null && now - windowStarted < failedLoginWindowMs;
    const failedCount = inWindow ? user.failed_login_count + 1 : 1;
    const lockedUntil =
      failedCount >= maxFailedLogins ? now + loginLockMs : null;

    await context.env.DB.prepare(
      `UPDATE users
       SET failed_login_count = ?,
           failed_login_window_started_at = ?,
           locked_until = ?,
           updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
      .bind(
        failedCount,
        inWindow ? windowStarted : now,
        lockedUntil,
        now,
        user.id,
        tenant.id,
      )
      .run();

    if (lockedUntil !== null) {
      throw new ApiError(
        429,
        'login_locked',
        'Too many failed attempts. Try again later.',
        { retryAfterSeconds: Math.ceil(loginLockMs / 1000) },
      );
    }
    throw new ApiError(
      401,
      'invalid_credentials',
      'Email or password is incorrect.',
    );
  }

  const existingSessionToken = getCookie(context, sessionCookieName);
  if (existingSessionToken !== undefined) {
    await context.env.DB.prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE token_hash = ? AND tenant_id = ? AND revoked_at IS NULL`,
    )
      .bind(now, await hashSessionToken(existingSessionToken), tenant.id)
      .run();
  }

  await context.env.DB.prepare(
    `UPDATE users
     SET failed_login_count = 0,
         failed_login_window_started_at = NULL,
         locked_until = NULL,
         last_login_at = ?,
         updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(now, now, user.id, tenant.id)
    .run();

  const session = await createSession(context.env, tenant.id, user.id);
  setCookie(
    context,
    sessionCookieName,
    session.token,
    sessionCookieOptions(context.req.url),
  );

  return context.json({
    data: {
      user: serializeUser({ ...user, last_login_at: now, updated_at: now }),
      tenant: {
        id: tenant.id,
        name: tenant.name ?? tenant.slug,
        slug: tenant.slug,
        primaryHostname: tenant.primaryHostname,
      },
      permissions: permissionsForRole(user.role),
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
  });
});

authRoutes.get('/api/v1/auth/session', sessionAuth, async (context) => {
  const payload = sessionPayload(context.get('auth'));
  if (payload === null) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid browser session is required.',
    );
  }
  return context.json({ data: payload });
});

authRoutes.post('/api/v1/auth/logout', sessionAuth, async (context) => {
  const auth = context.get('auth');
  if (auth.sessionId !== null) {
    await context.env.DB.prepare(
      'UPDATE sessions SET revoked_at = ? WHERE id = ? AND tenant_id = ?',
    )
      .bind(nowMs(), auth.sessionId, auth.tenantId)
      .run();
  }

  deleteCookie(context, sessionCookieName, { path: '/' });
  return context.body(null, 204);
});

authRoutes.post('/api/v1/auth/password', sessionAuth, async (context) => {
  const auth = context.get('auth');
  if (auth.userId === null) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid browser session is required.',
    );
  }

  const payload = await readJson(context, changePasswordSchema);
  const user = await context.env.DB.prepare(
    `SELECT id, tenant_id, email, name, password_hash, role, status,
            failed_login_count, failed_login_window_started_at, locked_until,
            last_login_at, created_at, updated_at
     FROM users
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
  )
    .bind(auth.userId, auth.tenantId)
    .first<UserRow>();

  if (
    user === null ||
    !(await verifyPassword(payload.currentPassword, user.password_hash))
  ) {
    throw new ApiError(
      400,
      'current_password_invalid',
      'The current password is incorrect.',
    );
  }

  const now = nowMs();
  const newHash = await hashPassword(payload.newPassword);
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE users
         SET password_hash = ?, updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
      ).bind(newHash, now, auth.userId, auth.tenantId),
      context.env.DB.prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE user_id = ? AND tenant_id = ? AND id <> ? AND revoked_at IS NULL`,
      ).bind(now, auth.userId, auth.tenantId, auth.sessionId),
    ]);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'password_change_failed',
        userId: auth.userId,
        message: errorMessage(error),
      }),
    );
    throw error;
  }

  return context.body(null, 204);
});
