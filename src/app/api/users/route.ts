import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // Only ADMIN and STAFF can list system users
    await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const roleParam = req.nextUrl.searchParams.get('role') as UserRole | null;
    const statusParam = req.nextUrl.searchParams.get('status') as UserStatus | null;

    const where: Prisma.UserWhereInput = {
      ...(roleParam && Object.values(UserRole).includes(roleParam) ? { role: roleParam } : {}),
      ...(statusParam ? { status: statusParam } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              customerNumber: true,
              companyName: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return apiSuccess(users, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
