import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ROLE_PERMISSIONS, ROLE_HIERARCHY } from '@/lib/rbac/permissions';
import { prisma } from '@/lib/db';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });

    const rolesData = Object.values(UserRole).map((role) => ({
      role,
      level: ROLE_HIERARCHY[role],
      permissions: ROLE_PERMISSIONS[role] || [],
    }));

    return apiSuccess({
      roles: rolesData,
      allPermissions: permissions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
