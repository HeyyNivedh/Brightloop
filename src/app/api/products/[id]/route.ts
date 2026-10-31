import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getSessionUser } from '@/lib/auth/session';
import { updateProductSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSessionUser(req);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        plans: {
          include: {
            pricing: {
              where: { active: true },
              orderBy: { amount: 'asc' },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found.');
    }

    if (session?.role === UserRole.CUSTOMER && !product.active) {
      throw new NotFoundError('Product not found or unavailable.');
    }

    return apiSuccess(product);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Product not found.');
    }

    const json = await req.json();
    const data = await validateRequest(updateProductSchema, json);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.category !== undefined ? { category: data.category?.toUpperCase() } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.metadata !== undefined ? { metadata: JSON.parse(JSON.stringify(data.metadata)) } : {}),
      },
      include: {
        variants: true,
        plans: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
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

    const existing = await prisma.product.findUnique({
      where: { id },
      include: { plans: true, quotationLines: true },
    });
    if (!existing) {
      throw new NotFoundError('Product not found.');
    }

    // If related plans or quotations exist, soft-deactivate instead of hard delete
    if (existing.plans.length > 0 || existing.quotationLines.length > 0) {
      const deactivated = await prisma.product.update({
        where: { id },
        data: { active: false },
      });

      await createAuditLog({
        userId: session.userId,
        action: 'PRODUCT_DEACTIVATED',
        entityType: 'Product',
        entityId: id,
        oldValues: existing,
        newValues: deactivated,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent'),
      });

      return apiSuccess({
        message: 'Product deactivated successfully (preserved historical quotations and plans).',
        product: deactivated,
      });
    }

    // Otherwise, safe to hard delete
    await prisma.product.delete({ where: { id } });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: id,
      oldValues: existing,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Product deleted successfully.' });
  } catch (error) {
    return handleApiError(error);
  }
}
