import { Prisma } from '@prisma/client';

export interface VariantAttributes {
  additionalPrice?: number;
  additionalCharge?: number;
  [key: string]: unknown;
}

/**
 * Safely extracts additional price adjustment from a variant's attributes JSON.
 */
export function getVariantAdditionalPrice(attributes: Prisma.JsonValue | null | undefined): number {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return 0;
  }

  const attrs = attributes as VariantAttributes;
  const rawPrice = attrs.additionalPrice ?? attrs.additionalCharge;

  if (typeof rawPrice === 'number' && !isNaN(rawPrice) && isFinite(rawPrice)) {
    return Math.max(0, Math.round(rawPrice * 100) / 100);
  }

  if (typeof rawPrice === 'string') {
    const parsed = parseFloat(rawPrice);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return Math.max(0, Math.round(parsed * 100) / 100);
    }
  }

  return 0;
}

export interface UnitPriceCalculationResult {
  basePrice: number;
  additionalPrice: number;
  finalUnitPrice: number;
}

/**
 * Calculates final unit price:
 * Final unit price = Base product price + Applicable variant adjustments
 * Guarantees 2-decimal monetary precision and non-negative results.
 */
export function calculateUnitPrice(
  basePrice: number | Prisma.Decimal,
  variantAttributes?: Prisma.JsonValue | null
): UnitPriceCalculationResult {
  const base = typeof basePrice === 'number' ? basePrice : basePrice.toNumber();
  const safeBase = Math.max(0, Math.round(base * 100) / 100);
  const additional = getVariantAdditionalPrice(variantAttributes);
  const finalUnitPrice = Math.max(0, Math.round((safeBase + additional) * 100) / 100);

  return {
    basePrice: safeBase,
    additionalPrice: additional,
    finalUnitPrice,
  };
}

