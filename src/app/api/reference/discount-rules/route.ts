import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { createDiscountRuleSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ConflictError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { Prisma, UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const code = req.nextUrl.searchParams.get('code');
    if (code) {
      const discount = await prisma.discountRule.findUnique({
        where: { code: code.toUpperCase() },
      });
      return apiSuccess(discount);
    }

    const discounts = await prisma.discountRule.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(discounts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only ADMIN can configure discount rules. STAFF is explicitly forbidden.
    const session = await requireRole(req, [UserRole.ADMIN]);

    const json = await req.json();
    const data = await validateRequest(createDiscountRuleSchema, json);

    const existing = await prisma.discountRule.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      throw new ConflictError('A discount rule with this promo code already exists.');
    }

    const discount = await prisma.discountRule.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type,
        value: data.value,
        minOrderAmount: data.minOrderAmount,
        maxDiscountAmount: data.maxDiscountAmount,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        usageLimit: data.usageLimit,
        applicablePlanIds: data.applicablePlanIds ? (data.applicablePlanIds as Prisma.InputJsonValue) : undefined,
        active: data.active,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'DISCOUNT_RULE_CREATED',
      entityType: 'DiscountRule',
      entityId: discount.id,
      newValues: discount,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(discount, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
