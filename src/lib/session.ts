import { randomId, randomToken, sha256Hex } from './crypto';
import { nowMs } from './time';

export const sessionCookieName = 'links_session';
export const csrfHeaderName = 'x-csrf-token';
export const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export interface CreatedSession {
  id: string;
  token: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

export async function createSession(
  env: Env,
  tenantId: string,
  userId: string,
): Promise<CreatedSession> {
  const id = randomId();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const createdAt = nowMs();
  const expiresAt = createdAt + sessionTtlMs;

  await env.DB.prepare(
    `INSERT INTO sessions
       (id, tenant_id, user_id, token_hash, csrf_token, created_at,
        expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      tenantId,
      userId,
      await sha256Hex(token),
      csrfToken,
      createdAt,
      expiresAt,
      createdAt,
    )
    .run();

  return { id, token, csrfToken, createdAt, expiresAt };
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export async function cleanupExpiredSessions(env: Env): Promise<void> {
  const cutoff = nowMs();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?')
    .bind(cutoff)
    .run();
}
