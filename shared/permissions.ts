export const userRoles = ['owner', 'editor', 'viewer'] as const;
export type UserRole = (typeof userRoles)[number];

export const permissions = [
  'links:read',
  'links:write',
  'analytics:read',
  'ai:suggest',
  'api_keys:manage',
  'users:manage',
] as const;
export type Permission = (typeof permissions)[number];

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  owner: permissions,
  editor: ['links:read', 'links:write', 'analytics:read', 'ai:suggest'],
  viewer: ['links:read', 'analytics:read'],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return [...rolePermissions[role]];
}

export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return rolePermissions[role].includes(permission);
}

export function hasPermission(
  granted: readonly Permission[],
  permission: Permission,
): boolean {
  return granted.includes(permission);
}
