import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { updateUserSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole, UserStatus } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    // A user can access their own record, or ADMIN/STAFF can access any user
    if (session.role === 'CUSTOMER' && session.userId !== id) {
      throw new ForbiddenError('Access denied: You cannot view other user records.');
    }

    const user = await prisma.user.findUnique({
      where: { id },
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
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return apiSuccess(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const json = await req.json();
    const data = await validateRequest(updateUserSchema, json);

    // Non-admin cannot modify other users, and cannot modify role or status
    const isAdmin = session.role === UserRole.ADMIN;
    if (!isAdmin) {
      if (session.userId !== id) {
        throw new ForbiddenError('Access denied: You cannot modify other user records.');
      }
      if (data.role || data.status) {
        throw new ForbiddenError('Access denied: Only administrators can modify roles and statuses.');
      }
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new NotFoundError('User');
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(isAdmin && data.role ? { role: data.role as UserRole } : {}),
        ...(isAdmin && data.status ? { status: data.status as UserStatus } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      oldValues: { name: existingUser.name, role: existingUser.role, status: existingUser.status },
      newValues: { name: updatedUser.name, role: updatedUser.role, status: updatedUser.status },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updatedUser);
  } catch (error) {
    return handleApiError(error);
  }
}
