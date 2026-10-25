import { getCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv, ApiKeyRow, AuthContext, SessionUserRow } from '../types';
import { constantTimeEqual, hashApiKey, parseApiKey } from '../lib/crypto';
import { ApiError, errorMessage } from '../lib/errors';
import { requireBearerToken } from '../lib/http';
import {
  csrfHeaderName,
  hashSessionToken,
  sessionCookieName,
} from '../lib/session';
import {
  hasPermission,
  permissions as allPermissions,
  permissionsForRole,
  type Permission,
} from '../../shared/permissions';
import { resolveTenantByHost } from '../services/tenants';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const bootstrapAuth: MiddlewareHandler<AppEnv> = async (
  context,
  next,
) => {
  const configuredToken = context.env.BOOTSTRAP_TOKEN;
  if (configuredToken === undefined || configuredToken.length === 0) {
    throw new ApiError(
      503,
      'bootstrap_not_configured',
      'Tenant provisioning is unavailable until BOOTSTRAP_TOKEN is configured.',
    );
  }

  const token = requireBearerToken(context.req.header('authorization'));
  if (token === null || !constantTimeEqual(token, configuredToken)) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid platform token is required.',
    );
  }

  await next();
};

async function authenticateApiKey(
  context: Context<AppEnv>,
): Promise<AuthContext> {
  const bearer = requireBearerToken(context.req.header('authorization'));
  const parsed = bearer === null ? null : parseApiKey(bearer);
  if (parsed === null) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid tenant API key is required.',
    );
  }

  const row = await context.env.DB.prepare(
    `SELECT
       k.id,
       k.tenant_id,
       k.key_hash,
       k.revoked_at,
       k.last_used_at,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       t.status AS tenant_status,
       (
         SELECT d.hostname
         FROM tenant_domains d
         WHERE d.tenant_id = t.id AND d.is_primary = 1
         LIMIT 1
       ) AS primary_hostname
     FROM api_keys k
     JOIN tenants t ON t.id = k.tenant_id
     WHERE k.prefix = ?
     LIMIT 1`,
  )
    .bind(parsed.prefix)
    .first<ApiKeyRow>();

  if (row === null || row.revoked_at !== null) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid tenant API key is required.',
    );
  }

  const actualHash = await hashApiKey(parsed.token);
  if (!constantTimeEqual(actualHash, row.key_hash)) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid tenant API key is required.',
    );
  }

  if (row.tenant_status !== 'active') {
    throw new ApiError(403, 'tenant_suspended', 'This tenant is suspended.');
  }

  if (row.last_used_at === null || row.last_used_at < Date.now() - 3_600_000) {
    context.executionCtx.waitUntil(
      context.env.DB.prepare(
        'UPDATE api_keys SET last_used_at = ? WHERE id = ? AND tenant_id = ?',
      )
        .bind(Date.now(), row.id, row.tenant_id)
        .run()
        .catch((error: unknown) => {
          console.error(
            JSON.stringify({
              event: 'api_key_touch_failed',
              keyId: row.id,
              message: errorMessage(error),
            }),
          );
        }),
    );
  }

  return {
    kind: 'api_key',
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    primaryHostname: row.primary_hostname,
    permissions: [...allPermissions],
    role: null,
    apiKeyId: row.id,
    sessionId: null,
    userId: null,
    userName: null,
    userEmail: null,
    csrfToken: null,
    sessionExpiresAt: null,
  };
}

function assertCsrf(context: Context<AppEnv>, csrfToken: string): void {
  if (!mutatingMethods.has(context.req.method)) {
    return;
  }

  const submitted = context.req.header(csrfHeaderName);
  if (submitted === undefined || !constantTimeEqual(submitted, csrfToken)) {
    throw new ApiError(
      403,
      'csrf_invalid',
      'A valid CSRF token is required for this request.',
    );
  }
}

async function authenticateSession(
  context: Context<AppEnv>,
): Promise<AuthContext> {
  const token = getCookie(context, sessionCookieName);
  if (token === undefined) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid browser session is required.',
    );
  }

  const hostname = new URL(context.req.url).host.toLowerCase();
  const tenant = await resolveTenantByHost(
    context.env,
    context.executionCtx,
    hostname,
  );
  if (tenant === null || tenant.status !== 'active') {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid browser session is required.',
    );
  }

  const row = await context.env.DB.prepare(
    `SELECT
       s.id AS session_id,
       s.csrf_token AS session_csrf_token,
       s.expires_at AS session_expires_at,
       s.revoked_at AS session_revoked_at,
       s.last_seen_at AS session_last_seen_at,
       u.id AS user_id,
       u.name AS user_name,
       u.email AS user_email,
       u.role AS user_role,
       u.status AS user_status,
       t.id AS tenant_id,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       t.status AS tenant_status,
       (
         SELECT d.hostname
         FROM tenant_domains d
         WHERE d.tenant_id = t.id AND d.is_primary = 1
         LIMIT 1
       ) AS primary_hostname
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN tenants t ON t.id = s.tenant_id
     WHERE s.token_hash = ? AND s.tenant_id = ?
     LIMIT 1`,
  )
    .bind(await hashSessionToken(token), tenant.id)
    .first<SessionUserRow>();

  if (
    row === null ||
    row.session_revoked_at !== null ||
    row.session_expires_at <= Date.now()
  ) {
    throw new ApiError(
      401,
      'unauthorized',
      'A valid browser session is required.',
    );
  }

  if (row.user_status !== 'active') {
    throw new ApiError(403, 'user_disabled', 'This user account is disabled.');
  }
  if (row.tenant_status !== 'active') {
    throw new ApiError(403, 'tenant_suspended', 'This tenant is suspended.');
  }

  assertCsrf(context, row.session_csrf_token);

  if (
    row.session_last_seen_at === null ||
    row.session_last_seen_at < Date.now() - 3_600_000
  ) {
    context.executionCtx.waitUntil(
      context.env.DB.prepare(
        'UPDATE sessions SET last_seen_at = ? WHERE id = ?',
      )
        .bind(Date.now(), row.session_id)
        .run()
        .catch((error: unknown) => {
          console.error(
            JSON.stringify({
              event: 'session_touch_failed',
              sessionId: row.session_id,
              message: errorMessage(error),
            }),
          );
        }),
    );
  }

  return {
    kind: 'session',
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    primaryHostname: row.primary_hostname,
    permissions: permissionsForRole(row.user_role),
    role: row.user_role,
    apiKeyId: null,
    sessionId: row.session_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    csrfToken: row.session_csrf_token,
    sessionExpiresAt: row.session_expires_at,
  };
}

export const tenantAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  const auth =
    context.req.header('authorization') !== undefined
      ? await authenticateApiKey(context)
      : await authenticateSession(context);
  context.set('auth', auth);
  await next();
};

export const sessionAuth: MiddlewareHandler<AppEnv> = async (context, next) => {
  const auth = await authenticateSession(context);
  context.set('auth', auth);
  await next();
};

export function requirePermission(
  permission: Permission,
): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    if (!hasPermission(context.get('auth').permissions, permission)) {
      throw new ApiError(
        403,
        'permission_denied',
        'Your role does not allow this action.',
      );
    }
    await next();
  };
}

export function assertSameOrigin(context: Context<AppEnv>): void {
  const origin = context.req.header('origin');
  if (origin === undefined) {
    return;
  }

  const expected = new URL(context.req.url).origin;
  if (origin !== expected) {
    throw new ApiError(
      403,
      'origin_invalid',
      'Cross-origin login is not allowed.',
    );
  }
}
