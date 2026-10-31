import { prisma } from '@/lib/db';
import { Prisma, DiscountRule, DiscountType } from '@prisma/client';

export interface DiscountEvaluationParams {
  code: string;
  orderAmount: number | Prisma.Decimal;
  planId?: string;
  quantity?: number;
  tx?: Prisma.TransactionClient;
}

export interface DiscountEvaluationResult {
  eligible: boolean;
  reason?: string;
  discountAmount: number;
  finalAmount: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountRule?: DiscountRule;
}

/**
 * Validates discount eligibility and calculates the discount amount.
 * Reusable by Member 2 for Quotation and Invoice processing.
 */
export async function evaluateDiscount(params: DiscountEvaluationParams): Promise<DiscountEvaluationResult> {
  const { code, orderAmount, planId, tx } = params;
  const db = tx || prisma;

  const rawAmount = typeof orderAmount === 'number' ? orderAmount : orderAmount.toNumber();
  const safeOrderAmount = Math.max(0, Math.round(rawAmount * 100) / 100);

  if (!code || typeof code !== 'string' || code.trim() === '') {
    return {
      eligible: false,
      reason: 'Discount code is required.',
      discountAmount: 0,
      finalAmount: safeOrderAmount,
    };
  }

  const normalizedCode = code.trim().toUpperCase();

  const discount = await db.discountRule.findUnique({
    where: { code: normalizedCode },
  });

  if (!discount) {
    return {
      eligible: false,
      reason: `Discount code '${normalizedCode}' was not found.`,
      discountAmount: 0,
      finalAmount: safeOrderAmount,
    };
  }

  return checkDiscountEligibility(discount, safeOrderAmount, planId);
}

/**
 * Pure evaluation function for in-memory rules and automated test cases.
 */
export function checkDiscountEligibility(
  discount: DiscountRule,
  orderAmount: number,
  planId?: string
): DiscountEvaluationResult {
  const safeOrderAmount = Math.max(0, Math.round(orderAmount * 100) / 100);

  // 1. Active status check
  if (!discount.active) {
    return {
      eligible: false,
      reason: `Discount code '${discount.code}' is currently inactive.`,
      discountAmount: 0,
      finalAmount: safeOrderAmount,
      discountRule: discount,
    };
  }

  const now = new Date();

  // 2. Start date check
  if (discount.startsAt && discount.startsAt > now) {
    return {
      eligible: false,
      reason: `Discount code '${discount.code}' is not yet active (starts on ${discount.startsAt.toISOString().split('T')[0]}).`,
      discountAmount: 0,
      finalAmount: safeOrderAmount,
      discountRule: discount,
    };
  }

  // 3. Expiration / End date check
  if (discount.endsAt && discount.endsAt < now) {
    return {
      eligible: false,
      reason: `Discount code '${discount.code}' has expired on ${discount.endsAt.toISOString().split('T')[0]}.`,
      discountAmount: 0,
      finalAmount: safeOrderAmount,
      discountRule: discount,
    };
  }

  // 4. Usage limit check
  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
    return {
      eligible: false,
      reason: `Discount code '${discount.code}' has reached its maximum usage limit of ${discount.usageLimit}.`,
      discountAmount: 0,
      finalAmount: safeOrderAmount,
      discountRule: discount,
    };
  }

  // 5. Minimum order amount check
  if (discount.minOrderAmount !== null) {
    const minAmount = typeof discount.minOrderAmount === 'number'
      ? discount.minOrderAmount
      : discount.minOrderAmount.toNumber();

    if (safeOrderAmount < minAmount) {
      return {
        eligible: false,
        reason: `Minimum order amount of $${minAmount.toFixed(2)} required to use this discount code.`,
        discountAmount: 0,
        finalAmount: safeOrderAmount,
        discountRule: discount,
      };
    }
  }

  // 6. Plan-specific check
  if (discount.applicablePlanIds && Array.isArray(discount.applicablePlanIds) && discount.applicablePlanIds.length > 0) {
    const allowedPlanIds = discount.applicablePlanIds as string[];
    if (!planId || !allowedPlanIds.includes(planId)) {
      return {
        eligible: false,
        reason: `Discount code '${discount.code}' is not applicable to the selected subscription plan.`,
        discountAmount: 0,
        finalAmount: safeOrderAmount,
        discountRule: discount,
      };
    }
  }

  // 7. Calculate discount value
  const numValue = typeof discount.value === 'number' ? discount.value : discount.value.toNumber();
  let calculatedDiscount = 0;

  if (discount.type === DiscountType.PERCENTAGE) {
    calculatedDiscount = Math.round(((safeOrderAmount * numValue) / 100) * 100) / 100;

    // Apply optional cap (maxDiscountAmount)
    if (discount.maxDiscountAmount !== null) {
      const maxCap = typeof discount.maxDiscountAmount === 'number'
        ? discount.maxDiscountAmount
        : discount.maxDiscountAmount.toNumber();

      if (calculatedDiscount > maxCap) {
        calculatedDiscount = maxCap;
      }
    }
  } else {
    // FIXED_AMOUNT
    calculatedDiscount = Math.round(numValue * 100) / 100;
  }

  // Cap discount at order amount so final price is never negative
  calculatedDiscount = Math.min(safeOrderAmount, calculatedDiscount);
  const finalAmount = Math.max(0, Math.round((safeOrderAmount - calculatedDiscount) * 100) / 100);

  return {
    eligible: true,
    discountAmount: calculatedDiscount,
    finalAmount,
    discountType: discount.type,
    discountValue: numValue,
    discountRule: discount,
  };
}

/**
 * Consumes a discount code by atomically incrementing its usageCount.
 * Called by Member 2 upon quotation confirmation or invoice finalization.
 */
export async function consumeDiscount(
  code: string,
  tx?: Prisma.TransactionClient
): Promise<{ success: boolean; discountRule?: DiscountRule; message?: string }> {
  const db = tx || prisma;
  const normalizedCode = code.trim().toUpperCase();

  const discount = await db.discountRule.findUnique({
    where: { code: normalizedCode },
  });

  if (!discount) {
    return { success: false, message: `Discount code '${normalizedCode}' not found.` };
  }

  if (!discount.active) {
    return { success: false, message: 'Discount code is inactive.' };
  }

  if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
    return { success: false, message: 'Discount code has reached its maximum usage limit.' };
  }

  const updated = await db.discountRule.update({
    where: { id: discount.id },
    data: {
      usageCount: { increment: 1 },
    },
  });

  return {
    success: true,
    discountRule: updated,
  };
}

