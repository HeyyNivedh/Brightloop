import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope, requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { updateSubscriptionStatusSchema, validateRequest } from '@/lib/validation/schemas';
import { transitionSubscription } from '@/lib/billing/subscriptions';
import { SubscriptionStatus, UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.subscription.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Subscription');
    }

    // Customer scope check
    await requireCustomerScope(req, existing.customerId);

    const json = await req.json();
    const data = await validateRequest(updateSubscriptionStatusSchema, json);

    // If caller is CUSTOMER:
    // Customers can cancel (or set cancelAtPeriodEnd) or pause.
    // Setting to PAST_DUE or manual forced active states requires STAFF or ADMIN.
    if (session.role === UserRole.CUSTOMER) {
      if (
        data.status === SubscriptionStatus.PAST_DUE ||
        (existing.status === SubscriptionStatus.CANCELLED && data.status === SubscriptionStatus.ACTIVE)
      ) {
        await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);
      }
    }

    const updated = await transitionSubscription(id, data.status as SubscriptionStatus, {
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_STATUS_CHANGED',
      entityType: 'Subscription',
      entityId: id,
      oldValues: { status: existing.status, cancelAtPeriodEnd: existing.cancelAtPeriodEnd },
      newValues: { status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
