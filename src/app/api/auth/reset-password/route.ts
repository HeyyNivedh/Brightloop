import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { resetPasswordSchema, validateRequest } from '@/lib/validation/schemas';
import { hashToken } from '@/lib/auth/tokens';
import { hashPassword } from '@/lib/auth/password';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { withTransaction } from '@/lib/api/transaction';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = await validateRequest(resetPasswordSchema, json);

    // 1. Hash incoming plain token to find matching DB record
    const tokenHash = hashToken(data.token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt !== null) {
      throw new ValidationError('Invalid or expired password reset token.');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new ValidationError('Password reset token has expired. Please request a new link.');
    }

    // 2. Hash new password
    const newPasswordHash = await hashPassword(data.newPassword);

    // 3. Atomically update user password and mark token as used
    await withTransaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
    });

    // 4. Audit log
    await createAuditLog({
      userId: resetToken.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: resetToken.userId,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({
      message: 'Password has been reset successfully. You may now log in with your new password.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
