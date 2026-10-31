import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { calculateUnitPrice } from '@/lib/pricing';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const variantId = req.nextUrl.searchParams.get('variantId');
    const basePriceParam = req.nextUrl.searchParams.get('basePrice');

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

    let variant = null;
    if (variantId) {
      variant = product.variants.find((v) => v.id === variantId);
      if (!variant) {
        throw new NotFoundError(`Variant '${variantId}' not found on product '${id}'.`);
      }
    }

    // Determine base price: from query param or from first active plan pricing or 0
    let basePrice = 0;
    if (basePriceParam !== null) {
      basePrice = parseFloat(basePriceParam) || 0;
    } else if (product.plans[0]?.pricing[0]?.amount) {
      const p = product.plans[0].pricing[0].amount;
      basePrice = typeof p === 'number' ? p : p.toNumber();
    }

    const calculation = calculateUnitPrice(basePrice, variant?.attributes);

    return apiSuccess({
      productId: product.id,
      productName: product.name,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      variantSku: variant?.sku ?? null,
      ...calculation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

