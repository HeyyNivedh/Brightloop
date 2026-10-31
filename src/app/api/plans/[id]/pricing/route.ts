import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { createPlanPricingSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundError('Subscription plan not found.');
    }

    const pricingTiers = await prisma.planPricing.findMany({
      where: { planId: id },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(pricingTiers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundError('Subscription plan not found.');
    }

    const json = await req.json();
    const data = await validateRequest(createPlanPricingSchema, json);

    const pricing = await prisma.planPricing.create({
      data: {
        planId: id,
        currency: data.currency.toUpperCase(),
        amount: data.amount,
        setupFee: data.setupFee,
        active: data.active,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PLAN_PRICING_CREATED',
      entityType: 'PlanPricing',
      entityId: pricing.id,
      newValues: pricing,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(pricing, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

