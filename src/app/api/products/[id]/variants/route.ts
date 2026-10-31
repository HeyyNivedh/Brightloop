import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { createProductVariantSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundError('Parent product not found.');
    }

    const variants = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess(variants);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireRole(req, [UserRole.ADMIN]);

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError('Parent product not found.');
    }

    const json = await req.json();
    // Allow either passing productId in body or inferring from URL param
    const payload = { ...json, productId: id };
    const data = await validateRequest(createProductVariantSchema, payload);

    const variant = await prisma.productVariant.create({
      data: {
        productId: id,
        sku: data.sku.toUpperCase(),
        name: data.name,
        attributes: data.attributes ? JSON.parse(JSON.stringify(data.attributes)) : undefined,
        active: data.active,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_VARIANT_CREATED',
      entityType: 'ProductVariant',
      entityId: variant.id,
      newValues: variant,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(variant, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

