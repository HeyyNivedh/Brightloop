import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError, ConflictError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';

const updateDiscountRuleSchema = z.object({
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().toUpperCase().min(3).optional(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  value: z.number().positive('Discount value must be greater than zero').optional(),
  minOrderAmount: z.number().positive().nullable().optional(),
  maxDiscountAmount: z.number().positive().nullable().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  applicablePlanIds: z.array(z.string()).nullable().optional(),
  active: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const discount = await prisma.discountRule.findUnique({ where: { id } });
    if (!discount) {
      throw new NotFoundError('Discount rule not found.');
    }

    return apiSuccess(discount);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.discountRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Discount rule not found.');
    }

    const json = await req.json();
    const data = await updateDiscountRuleSchema.parseAsync(json);

    if (data.code && data.code !== existing.code) {
      const codeConflict = await prisma.discountRule.findUnique({ where: { code: data.code } });
      if (codeConflict) {
        throw new ConflictError('A discount rule with this promo code already exists.');
      }
    }

    const updated = await prisma.discountRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.minOrderAmount !== undefined ? { minOrderAmount: data.minOrderAmount } : {}),
        ...(data.maxDiscountAmount !== undefined ? { maxDiscountAmount: data.maxDiscountAmount } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
        ...(data.usageLimit !== undefined ? { usageLimit: data.usageLimit } : {}),
        ...(data.applicablePlanIds !== undefined ? { applicablePlanIds: data.applicablePlanIds as Prisma.InputJsonValue } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'DISCOUNT_RULE_UPDATED',
      entityType: 'DiscountRule',
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

    const existing = await prisma.discountRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Discount rule not found.');
    }

    // Soft deactivate discount rule to maintain historical integrity
    const deactivated = await prisma.discountRule.update({
      where: { id },
      data: { active: false },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'DISCOUNT_RULE_DEACTIVATED',
      entityType: 'DiscountRule',
      entityId: id,
      oldValues: existing,
      newValues: deactivated,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Discount rule deactivated successfully.', discountRule: deactivated });
  } catch (error) {
    return handleApiError(error);
  }
}

