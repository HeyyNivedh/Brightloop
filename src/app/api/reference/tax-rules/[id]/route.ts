import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const updateTaxRuleSchema = z.object({
  name: z.string().trim().min(2).optional(),
  country: z.string().length(2).optional(),
  state: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  rate: z.number().positive().max(1, 'Rate must be between 0 and 1').optional(),
  isCompound: z.boolean().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
  description: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const tax = await prisma.taxRule.findUnique({ where: { id } });
    if (!tax) {
      throw new NotFoundError('Tax rule not found.');
    }

    return apiSuccess(tax);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.taxRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Tax rule not found.');
    }

    const json = await req.json();
    const data = await updateTaxRuleSchema.parseAsync(json);

    const updated = await prisma.taxRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.country !== undefined ? { country: data.country.toUpperCase() } : {}),
        ...(data.state !== undefined ? { state: data.state?.toUpperCase() ?? null } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.rate !== undefined ? { rate: data.rate } : {}),
        ...(data.isCompound !== undefined ? { isCompound: data.isCompound } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'TAX_RULE_UPDATED',
      entityType: 'TaxRule',
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

    const existing = await prisma.taxRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Tax rule not found.');
    }

    // Soft deactivate tax rule to protect historical records
    const deactivated = await prisma.taxRule.update({
      where: { id },
      data: { active: false },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'TAX_RULE_DEACTIVATED',
      entityType: 'TaxRule',
      entityId: id,
      oldValues: existing,
      newValues: deactivated,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Tax rule deactivated successfully.', taxRule: deactivated });
  } catch (error) {
    return handleApiError(error);
  }
}

