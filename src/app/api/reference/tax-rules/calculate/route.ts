import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { calculateTax } from '@/lib/pricing';
import { z } from 'zod';

const calculateTaxSchema = z.object({
  amount: z.number().nonnegative('Amount must be non-negative'),
  country: z.string().min(2, 'Country code is required'),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  isTaxExempt: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const json = await req.json();
    const data = await calculateTaxSchema.parseAsync(json);

    const result = await calculateTax({
      amount: data.amount,
      country: data.country,
      state: data.state,
      postalCode: data.postalCode,
      isTaxExempt: data.isTaxExempt,
    });

    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

