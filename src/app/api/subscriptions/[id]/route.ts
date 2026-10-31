import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: true,
        plan: {
          include: {
            product: true,
            pricing: { where: { active: true } },
          },
        },
        lines: true,
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
          include: { payments: true },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    // Customer Data Isolation
    await requireCustomerScope(req, subscription.customerId);

    return apiSuccess(subscription);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.subscription.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundError('Subscription');
    }

    await requireCustomerScope(req, existing.customerId);

    const json = await req.json();
    const updateData: Prisma.SubscriptionUpdateInput = {};

    if (typeof json.autoRenew === 'boolean') {
      updateData.autoRenew = json.autoRenew;
    }
    if (typeof json.cancelAtPeriodEnd === 'boolean') {
      updateData.cancelAtPeriodEnd = json.cancelAtPeriodEnd;
    }
    if (json.metadata && typeof json.metadata === 'object') {
      updateData.metadata = json.metadata as Prisma.InputJsonValue;
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: updateData,
      include: { lines: true, plan: true, customer: true },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_UPDATED',
      entityType: 'Subscription',
      entityId: id,
      oldValues: existing,
      newValues: updated,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
