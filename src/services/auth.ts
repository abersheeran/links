import type { AuthContext } from '../types';

export function sessionPayload(auth: AuthContext) {
  if (auth.kind !== 'session' || auth.userId === null || auth.role === null) {
    return null;
  }

  return {
    user: {
      id: auth.userId,
      name: auth.userName ?? '',
      email: auth.userEmail ?? '',
      role: auth.role,
      status: 'active' as const,
    },
    tenant: {
      id: auth.tenantId,
      name: auth.tenantName,
      slug: auth.tenantSlug,
      primaryHostname: auth.primaryHostname,
    },
    permissions: auth.permissions,
    csrfToken: auth.csrfToken,
    expiresAt:
      auth.sessionExpiresAt === null
        ? null
        : new Date(auth.sessionExpiresAt).toISOString(),
  };
}
