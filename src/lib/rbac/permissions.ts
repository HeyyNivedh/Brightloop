import { UserRole } from '@prisma/client';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 30,
  STAFF: 20,
  CUSTOMER: 10,
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: [
    '*', // Wildcard: Full superuser access
    'users:manage',
    'users:read',
    'staff:create',
    'audit:read',
    'customers:manage',
    'customers:read',
    'products:manage',
    'plans:manage',
    'taxes:manage',
    'discounts:manage',
    'subscriptions:manage',
    'subscriptions:read',
    'invoices:manage',
    'invoices:read',
    'payments:manage',
  ],
  STAFF: [
    'users:read',
    'customers:manage',
    'customers:read',
    'subscriptions:manage',
    'subscriptions:read',
    'invoices:manage',
    'invoices:read',
    'payments:manage',
    'products:read',
    'plans:read',
  ],
  CUSTOMER: [
    'customer:self:read',
    'customer:self:update',
    'subscriptions:self:read',
    'invoices:self:read',
    'payments:self:create',
    'payments:self:read',
  ],
};

/**
 * Check if a role possesses a specific permission code.
 */
export function hasPermission(role: UserRole, permissionCode: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  if (permissions.includes('*')) {
    return true;
  }
  return permissions.includes(permissionCode);
}

/**
 * Check if a user's role meets the minimum required role level.
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

/**
 * Strict role matching.
 */
export function isOneOfRoles(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}
