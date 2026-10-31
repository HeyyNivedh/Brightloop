import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { forgotPasswordSchema, validateRequest } from '@/lib/validation/schemas';
import { generateSecureRandomToken, hashToken } from '@/lib/auth/tokens';
import { getEmailAdapter } from '@/lib/auth/email-adapter';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = await validateRequest(forgotPasswordSchema, json);

    const genericSuccessMessage =
      'If an account exists with this email address, a password reset link has been dispatched.';

    // 1. Look up user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    // 2. If user not found, return generic success (prevents account enumeration)
    if (!user) {
      return apiSuccess({ message: genericSuccessMessage });
    }

    // 3. Invalidate any existing unused reset tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // 4. Generate secure token & store hashed version
    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // 5. Send reset email via adapter (development adapter logs and stores in memory)
    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;
    const emailAdapter = getEmailAdapter();
    await emailAdapter.sendPasswordResetEmail(user.email, rawToken, resetUrl);

    // 6. Audit log
    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: genericSuccessMessage });
  } catch (error) {
    return handleApiError(error);
  }
}
