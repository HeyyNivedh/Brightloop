import { NextRequest } from 'next/server';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { evaluateDiscount } from '@/lib/pricing';
import { z } from 'zod';

const evaluateDiscountSchema = z.object({
  code: z.string().trim().min(1, 'Discount code is required'),
  orderAmount: z.number().nonnegative('Order amount must be non-negative'),
  planId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = await evaluateDiscountSchema.parseAsync(json);

    const result = await evaluateDiscount({
      code: data.code,
      orderAmount: data.orderAmount,
      planId: data.planId,
      quantity: data.quantity,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

