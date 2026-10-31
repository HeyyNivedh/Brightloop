import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { confirmQuotation } from '@/lib/billing/quotations';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Quotation');
    }

    await requireCustomerScope(req, existing.customerId);

    // Atomically confirm quotation and create subscription
    const result = await prisma.$transaction(async (tx) => {
      return confirmQuotation(id, tx);
    });

    await createAuditLog({
      userId: session.userId,
      action: 'QUOTATION_CONFIRMED',
      entityType: 'Quotation',
      entityId: id,
      newValues: {
        quotationStatus: result.quotation.status,
        subscriptionId: result.subscription.id,
        subscriptionNumber: result.subscription.subscriptionNumber,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({
      message: 'Quotation successfully confirmed and converted into active subscription.',
      quotation: result.quotation,
      subscription: result.subscription,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
