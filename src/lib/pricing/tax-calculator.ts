import { prisma } from '@/lib/db';
import { Prisma, TaxRule } from '@prisma/client';

export interface TaxCalculationParams {
  amount: number | Prisma.Decimal;
  country: string;
  state?: string;
  postalCode?: string;
  isTaxExempt?: boolean;
  tx?: Prisma.TransactionClient;
}

export interface AppliedTaxItem {
  id: string;
  name: string;
  rate: number;
  ratePercentage: number;
  isCompound: boolean;
  priority: number;
  taxAmount: number;
}

export interface TaxCalculationResult {
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  isTaxExempt: boolean;
  appliedTaxes: AppliedTaxItem[];
}

/**
 * Calculates tax rules applicable to a given amount and location.
 * Reusable by Member 2 for Quotation and Invoice calculations.
 */
export async function calculateTax(params: TaxCalculationParams): Promise<TaxCalculationResult> {
  const { amount, country, state, isTaxExempt, tx } = params;
  const db = tx || prisma;

  const baseAmount = typeof amount === 'number' ? amount : amount.toNumber();
  const safeBase = Math.max(0, Math.round(baseAmount * 100) / 100);

  if (isTaxExempt || safeBase === 0) {
    return {
      taxableAmount: safeBase,
      taxAmount: 0,
      totalAmount: safeBase,
      isTaxExempt: Boolean(isTaxExempt),
      appliedTaxes: [],
    };
  }

  const normalizedCountry = country.trim().toUpperCase();
  const normalizedState = state?.trim().toUpperCase();

  // Find active rules matching country and state (or state is null/wildcard)
  const rules = await db.taxRule.findMany({
    where: {
      active: true,
      country: normalizedCountry,
      OR: [
        { state: null },
        ...(normalizedState ? [{ state: normalizedState }] : []),
      ],
    },
    orderBy: [
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const appliedTaxes: AppliedTaxItem[] = [];
  let totalTax = 0;

  for (const rule of rules) {
    const rateNumber = typeof rule.rate === 'number' ? rule.rate : rule.rate.toNumber();
    if (rateNumber <= 0) continue;

    const applicableBasis = rule.isCompound ? (safeBase + totalTax) : safeBase;
    const itemTax = Math.round(applicableBasis * rateNumber * 100) / 100;

    appliedTaxes.push({
      id: rule.id,
      name: rule.name,
      rate: rateNumber,
      ratePercentage: Math.round(rateNumber * 10000) / 100, // e.g. 0.0825 -> 8.25%
      isCompound: rule.isCompound,
      priority: rule.priority,
      taxAmount: itemTax,
    });

    totalTax = Math.round((totalTax + itemTax) * 100) / 100;
  }

  const finalTotal = Math.round((safeBase + totalTax) * 100) / 100;

  return {
    taxableAmount: safeBase,
    taxAmount: totalTax,
    totalAmount: finalTotal,
    isTaxExempt: false,
    appliedTaxes,
  };
}

/**
 * Pure tax calculation function for test scenarios or when tax rules are already fetched.
 */
export function computeTaxFromRules(amount: number, rules: TaxRule[], isTaxExempt = false): TaxCalculationResult {
  const safeBase = Math.max(0, Math.round(amount * 100) / 100);

  if (isTaxExempt || safeBase === 0) {
    return {
      taxableAmount: safeBase,
      taxAmount: 0,
      totalAmount: safeBase,
      isTaxExempt,
      appliedTaxes: [],
    };
  }

  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const appliedTaxes: AppliedTaxItem[] = [];
  let totalTax = 0;

  for (const rule of sorted) {
    if (!rule.active) continue;
    const rateNumber = typeof rule.rate === 'number' ? rule.rate : rule.rate.toNumber();
    if (rateNumber <= 0) continue;

    const applicableBasis = rule.isCompound ? (safeBase + totalTax) : safeBase;
    const itemTax = Math.round(applicableBasis * rateNumber * 100) / 100;

    appliedTaxes.push({
      id: rule.id,
      name: rule.name,
      rate: rateNumber,
      ratePercentage: Math.round(rateNumber * 10000) / 100,
      isCompound: rule.isCompound,
      priority: rule.priority,
      taxAmount: itemTax,
    });

    totalTax = Math.round((totalTax + itemTax) * 100) / 100;
  }

  return {
    taxableAmount: safeBase,
    taxAmount: totalTax,
    totalAmount: Math.round((safeBase + totalTax) * 100) / 100,
    isTaxExempt: false,
    appliedTaxes,
  };
}
