import type { Permission, UserRole } from '../shared/permissions';

export type LinkStatus = 'active' | 'disabled';
export type TenantStatus = 'active' | 'suspended';
export type UserStatus = 'active' | 'disabled';

export interface AuthContext {
  kind: 'api_key' | 'session';
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  primaryHostname: string | null;
  permissions: Permission[];
  role: UserRole | null;
  apiKeyId: string | null;
  sessionId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  csrfToken: string | null;
  sessionExpiresAt: number | null;
}

export interface AppVariables {
  auth: AuthContext;
  requestId: string;
  startedAt: number;
}

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};

export interface BackgroundContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  revoked_at: number | null;
  tenant_slug: string;
  tenant_name: string;
  tenant_status: TenantStatus;
  primary_hostname: string | null;
  last_used_at: number | null;
}

export interface LinkRow {
  id: string;
  tenant_id: string;
  code: string;
  target_url: string;
  title: string | null;
  description: string | null;
  tags: string;
  status: LinkStatus;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CachedTenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  primaryHostname: string | null;
}

export interface CachedLink {
  id: string;
  code: string;
  targetUrl: string;
  status: LinkStatus;
  expiresAt: number | null;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: number;
  updated_at: number;
  primary_hostname: string | null;
}

export interface ApiKeyMetadataRow {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  failed_login_count: number;
  failed_login_window_started_at: number | null;
  locked_until: number | null;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface SessionUserRow {
  session_id: string;
  session_csrf_token: string;
  session_expires_at: number;
  session_revoked_at: number | null;
  session_last_seen_at: number | null;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: UserRole;
  user_status: UserStatus;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: TenantStatus;
  primary_hostname: string | null;
}
