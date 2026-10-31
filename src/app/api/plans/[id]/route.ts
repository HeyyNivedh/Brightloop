import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getSessionUser } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { BillingInterval, UserRole } from '@prisma/client';
import { z } from 'zod';

const updateSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  variantId: z.string().nullable().optional(),
  trialPeriodDays: z.number().int().nonnegative().optional(),
  billingInterval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).optional(),
  intervalCount: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionUser(req);

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        product: true,
        variant: true,
        pricing: {
          orderBy: { createdAt: 'desc' },
        },
        subscriptions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError('Subscription plan not found.');
    }

    if (session?.role === UserRole.CUSTOMER && !plan.active) {
      throw new NotFoundError('Subscription plan not available.');
    }

    return apiSuccess(plan);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Subscription plan not found.');
    }

    const json = await req.json();
    const data = await updateSubscriptionPlanSchema.parseAsync(json);

    const updated = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.variantId !== undefined ? { variantId: data.variantId } : {}),
        ...(data.trialPeriodDays !== undefined ? { trialPeriodDays: data.trialPeriodDays } : {}),
        ...(data.billingInterval !== undefined ? { billingInterval: data.billingInterval as BillingInterval } : {}),
        ...(data.intervalCount !== undefined ? { intervalCount: data.intervalCount } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
      include: {
        product: true,
        variant: true,
        pricing: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      entityType: 'SubscriptionPlan',
      entityId: updated.id,
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { subscriptions: true, quotationLines: true },
    });
    if (!existing) {
      throw new NotFoundError('Subscription plan not found.');
    }

    // If active subscriptions or quotations exist, deactivate rather than delete
    if (existing.subscriptions.length > 0 || existing.quotationLines.length > 0) {
      const deactivated = await prisma.subscriptionPlan.update({
        where: { id },
        data: { active: false },
      });

      await createAuditLog({
        userId: session.userId,
        action: 'SUBSCRIPTION_PLAN_DEACTIVATED',
        entityType: 'SubscriptionPlan',
        entityId: id,
        oldValues: existing,
        newValues: deactivated,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent'),
      });

      return apiSuccess({
        message: 'Plan deactivated successfully (preserved active subscriptions and quotations).',
        plan: deactivated,
      });
    }

    await prisma.subscriptionPlan.delete({ where: { id } });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_PLAN_DELETED',
      entityType: 'SubscriptionPlan',
      entityId: id,
      oldValues: existing,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Subscription plan deleted successfully.' });
  } catch (error) {
    return handleApiError(error);
  }
}
