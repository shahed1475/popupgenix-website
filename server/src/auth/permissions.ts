export type Role = 'owner' | 'admin' | 'member';
export type Permission = 'companies.read' | 'companies.write';

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(['companies.read', 'companies.write']),
  admin: new Set<Permission>(['companies.read', 'companies.write']),
  member: new Set<Permission>(['companies.read']),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
