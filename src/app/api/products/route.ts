import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getSessionUser } from '@/lib/auth/session';
import { createProductSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const search = req.nextUrl.searchParams.get('search') || undefined;
    const category = req.nextUrl.searchParams.get('category') || undefined;
    const activeParam = req.nextUrl.searchParams.get('active');

    // Customers only see active products
    const filterActive = session?.role === UserRole.CUSTOMER
      ? true
      : activeParam !== null
        ? activeParam === 'true'
        : undefined;

    const products = await prisma.product.findMany({
      where: {
        ...(filterActive !== undefined ? { active: filterActive } : {}),
        ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        variants: {
          orderBy: { createdAt: 'asc' },
        },
        plans: {
          include: {
            pricing: {
              where: { active: true },
              orderBy: { amount: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiSuccess(products);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only ADMIN can create products
    const session = await requireRole(req, [UserRole.ADMIN]);

    const json = await req.json();
    const data = await validateRequest(createProductSchema, json);

    const product = await prisma.product.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        category: data.category?.toUpperCase(),
        active: data.active,
        metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
      },
      include: {
        variants: true,
        plans: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      newValues: product,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(product, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
