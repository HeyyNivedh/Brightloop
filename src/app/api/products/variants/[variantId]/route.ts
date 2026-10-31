import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const updateProductVariantSchema = z.object({
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(2).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  try {
    const { variantId } = await params;

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, plans: true },
    });

    if (!variant) {
      throw new NotFoundError('Product variant not found.');
    }

    return apiSuccess(variant);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  try {
    const { variantId } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing) {
      throw new NotFoundError('Product variant not found.');
    }

    const json = await req.json();
    const data = await updateProductVariantSchema.parseAsync(json);

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku.toUpperCase() } : {}),
        ...(data.attributes !== undefined ? { attributes: JSON.parse(JSON.stringify(data.attributes)) } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
      include: { product: true },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_VARIANT_UPDATED',
      entityType: 'ProductVariant',
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ variantId: string }> }) {
  try {
    const { variantId } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { plans: true },
    });
    if (!existing) {
      throw new NotFoundError('Product variant not found.');
    }

    // If related plans exist, deactivate instead of delete
    if (existing.plans.length > 0) {
      const deactivated = await prisma.productVariant.update({
        where: { id: variantId },
        data: { active: false },
      });

      await createAuditLog({
        userId: session.userId,
        action: 'PRODUCT_VARIANT_DEACTIVATED',
        entityType: 'ProductVariant',
        entityId: variantId,
        oldValues: existing,
        newValues: deactivated,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent'),
      });

      return apiSuccess({
        message: 'Variant deactivated successfully (referenced in subscription plans).',
        variant: deactivated,
      });
    }

    await prisma.productVariant.delete({ where: { id: variantId } });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_VARIANT_DELETED',
      entityType: 'ProductVariant',
      entityId: variantId,
      oldValues: existing,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Product variant deleted successfully.' });
  } catch (error) {
    return handleApiError(error);
  }
}

