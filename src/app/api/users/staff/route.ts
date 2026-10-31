import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { createStaffUserSchema, validateRequest } from '@/lib/validation/schemas';
import { hashPassword } from '@/lib/auth/password';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ConflictError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    // Strictly ADMIN only! STAFF is forbidden from creating staff accounts
    const admin = await requireRole(req, [UserRole.ADMIN]);

    const json = await req.json();
    const data = await validateRequest(createStaffUserSchema, json);

    // Prevent duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictError('A user with this email address already exists.');
    }

    const passwordHash = await hashPassword(data.password);

    const newUser = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role as UserRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      userId: admin.userId,
      action: 'STAFF_USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      newValues: { email: newUser.email, role: newUser.role, createdBy: admin.email },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(newUser, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
