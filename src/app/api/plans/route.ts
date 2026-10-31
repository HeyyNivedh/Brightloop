import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getSessionUser } from '@/lib/auth/session';
import { createSubscriptionPlanSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';
import { BillingInterval, UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const intervalParam = req.nextUrl.searchParams.get('interval') as BillingInterval | null;
    const productId = req.nextUrl.searchParams.get('productId') || undefined;
    const activeParam = req.nextUrl.searchParams.get('active');

    // Customers only see active plans
    const filterActive = session?.role === UserRole.CUSTOMER
      ? true
      : activeParam !== null
        ? activeParam === 'true'
        : undefined;

    const plans = await prisma.subscriptionPlan.findMany({
      where: {
        ...(filterActive !== undefined ? { active: filterActive } : {}),
        ...(intervalParam && Object.values(BillingInterval).includes(intervalParam) ? { billingInterval: intervalParam } : {}),
        ...(productId ? { productId } : {}),
      },
      include: {
        product: true,
        variant: true,
        pricing: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(plans);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only ADMIN can configure subscription plans
    const session = await requireRole(req, [UserRole.ADMIN]);

    const json = await req.json();
    const data = await validateRequest(createSubscriptionPlanSchema, json);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        productId: data.productId,
        variantId: data.variantId || null,
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        trialPeriodDays: data.trialPeriodDays,
        billingInterval: data.billingInterval,
        intervalCount: data.intervalCount,
        active: data.active,
        pricing: data.pricing && data.pricing.length > 0
          ? {
              create: data.pricing.map((p) => ({
                currency: p.currency.toUpperCase(),
                amount: p.amount,
                setupFee: p.setupFee,
                active: p.active,
                effectiveFrom: p.effectiveFrom,
                effectiveTo: p.effectiveTo,
              })),
            }
          : undefined,
      },
      include: {
        product: true,
        variant: true,
        pricing: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_PLAN_CREATED',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      newValues: plan,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(plan, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
