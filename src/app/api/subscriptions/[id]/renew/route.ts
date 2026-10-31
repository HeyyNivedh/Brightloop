import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { renewSubscriptionCycle } from '@/lib/billing/subscriptions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Subscription');
    }

    await requireCustomerScope(req, existing.customerId);

    const renewed = await renewSubscriptionCycle(id);

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_RENEWED',
      entityType: 'Subscription',
      entityId: id,
      oldValues: {
        currentPeriodStart: existing.currentPeriodStart,
        currentPeriodEnd: existing.currentPeriodEnd,
      },
      newValues: {
        currentPeriodStart: renewed.currentPeriodStart,
        currentPeriodEnd: renewed.currentPeriodEnd,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(renewed);
  } catch (error) {
    return handleApiError(error);
  }
}
