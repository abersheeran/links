import type { UserRole } from '../../shared/permissions';
import type { UserRow } from '../types';
import { randomId } from '../lib/crypto';
import { hashPassword } from '../lib/password';
import { nowMs, toIso } from '../lib/time';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export async function createTenantUser(
  env: Env,
  tenantId: string,
  input: CreateUserInput,
): Promise<UserRow> {
  const now = nowMs();
  const row: UserRow = {
    id: randomId(),
    tenant_id: tenantId,
    email: input.email,
    name: input.name,
    password_hash: await hashPassword(input.password),
    role: input.role,
    status: 'active',
    failed_login_count: 0,
    failed_login_window_started_at: null,
    locked_until: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };

  await env.DB.prepare(
    `INSERT INTO users
       (id, tenant_id, email, name, password_hash, role, status,
        failed_login_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
  )
    .bind(
      row.id,
      row.tenant_id,
      row.email,
      row.name,
      row.password_hash,
      row.role,
      row.created_at,
      row.updated_at,
    )
    .run();

  return row;
}

export function serializeUser(
  row: Pick<
    UserRow,
    | 'id'
    | 'name'
    | 'email'
    | 'role'
    | 'status'
    | 'last_login_at'
    | 'created_at'
    | 'updated_at'
  >,
) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
