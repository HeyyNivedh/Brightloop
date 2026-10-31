import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { ROLE_PERMISSIONS } from '@/lib/rbac/permissions';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            customerNumber: true,
            companyName: true,
            currency: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const permissions = ROLE_PERMISSIONS[user.role] || [];

    return apiSuccess({
      user,
      permissions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
