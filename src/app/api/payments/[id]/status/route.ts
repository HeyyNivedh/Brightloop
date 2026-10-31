import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { updatePaymentStatusSchema, validateRequest } from '@/lib/validation/schemas';
import { updatePaymentStatusRecord } from '@/lib/billing/payments';
import { PaymentStatus, UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Payment refunds or manual reconciliations are restricted to STAFF or ADMIN
    const session = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Payment');
    }

    const json = await req.json();
    const data = await validateRequest(updatePaymentStatusSchema, json);

    const updated = await prisma.$transaction(async (tx) => {
      return updatePaymentStatusRecord(
        id,
        data.status as PaymentStatus,
        {
          failureReason: data.failureReason,
          paidAt: data.paidAt,
        },
        tx
      );
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PAYMENT_STATUS_CHANGED',
      entityType: 'Payment',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status, failureReason: updated.failureReason },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
