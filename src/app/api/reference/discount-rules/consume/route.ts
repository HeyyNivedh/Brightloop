import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { consumeDiscount } from '@/lib/pricing';
import { ValidationError } from '@/lib/api/errors';
import { z } from 'zod';

const consumeDiscountSchema = z.object({
  code: z.string().trim().min(1, 'Discount code is required'),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const json = await req.json();
    const data = await consumeDiscountSchema.parseAsync(json);

    const result = await consumeDiscount(data.code);

    if (!result.success) {
      throw new ValidationError(result.message || 'Failed to consume discount code.');
    }

    return apiSuccess({
      message: 'Discount code consumed successfully.',
      discountRule: result.discountRule,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
