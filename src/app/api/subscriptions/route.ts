import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { createSubscriptionSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { createAuditLog } from '@/lib/api/audit';
import { Prisma, SubscriptionStatus, UserRole } from '@prisma/client';
import { createSubscriptionRecord } from '@/lib/billing/subscriptions';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const statusParam = req.nextUrl.searchParams.get('status') as SubscriptionStatus | null;
    const customerIdParam = req.nextUrl.searchParams.get('customerId');
    const planIdParam = req.nextUrl.searchParams.get('planId');

    const where: Prisma.SubscriptionWhereInput = {};

    // Customer Isolation:
    // If the caller is CUSTOMER, they can only see subscriptions belonging to their customerId!
    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        return apiSuccess([], 200, buildPaginationMeta(0, page, limit));
      }
      where.customerId = session.customerId;
    } else if (customerIdParam) {
      where.customerId = customerIdParam;
    }

    if (statusParam && Object.values(SubscriptionStatus).includes(statusParam)) {
      where.status = statusParam;
    }

    if (planIdParam) {
      where.planId = planIdParam;
    }

    if (search) {
      where.OR = [
        { subscriptionNumber: { contains: search, mode: 'insensitive' } },
        { customer: { contactName: { contains: search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
        { plan: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { id: true, customerNumber: true, contactName: true, companyName: true, email: true },
          },
          plan: {
            select: { id: true, code: true, name: true, billingInterval: true, intervalCount: true },
          },
          lines: true,
          _count: { select: { invoices: true } },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return apiSuccess(subscriptions, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const json = await req.json();
    const data = await validateRequest(createSubscriptionSchema, json);

    // If caller is CUSTOMER, enforce that they can only subscribe for themselves
    await requireCustomerScope(req, data.customerId);

    const subscription = await createSubscriptionRecord({
      customerId: data.customerId,
      planId: data.planId,
      currency: data.currency,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      autoRenew: data.autoRenew,
      metadata: data.metadata,
      lines: data.lines,
    });

    await createAuditLog({
      userId: session.userId,
      action: 'SUBSCRIPTION_CREATED',
      entityType: 'Subscription',
      entityId: subscription.id,
      newValues: {
        subscriptionNumber: subscription.subscriptionNumber,
        customerId: subscription.customerId,
        planId: subscription.planId,
        status: subscription.status,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(subscription, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
