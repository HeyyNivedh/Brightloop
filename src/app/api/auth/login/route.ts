import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { loginSchema, validateRequest } from '@/lib/validation/schemas';
import { verifyPassword } from '@/lib/auth/password';
import { signSessionToken } from '@/lib/auth/tokens';
import { setSessionCookie } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { UnauthorizedError, ForbiddenError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = await validateRequest(loginSchema, json);

    // 1. Retrieve user by normalized email with linked customer
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { customer: true },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // 2. Check account status
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(`Your account is currently ${user.status.toLowerCase()}. Please contact support.`);
    }

    // 3. Verify password hash
    const passwordValid = await verifyPassword(data.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // 4. Audit log login event
    await createAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    // 5. Sign JWT session token
    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customer?.id || null,
    });

    const response = apiSuccess({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        customerId: user.customer?.id || null,
      },
      token,
    });

    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
