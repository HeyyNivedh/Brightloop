import { BillingInterval, Prisma } from '@prisma/client';

export type DecimalLike = Prisma.Decimal | number | string;

/**
 * Convert number or DecimalLike to a 2-decimal rounded Prisma.Decimal
 */
export function toDecimal(value: DecimalLike, decimalPlaces = 2): Prisma.Decimal {
  const num = typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  const rounded = Number(Math.round(Number(num + 'e' + decimalPlaces)) + 'e-' + decimalPlaces);
  return new Prisma.Decimal(rounded.toFixed(decimalPlaces));
}

/**
 * Calculate the end date for a billing period based on interval and count.
 */
export function calculatePeriodEnd(
  startDate: Date,
  interval: BillingInterval,
  intervalCount = 1
): Date {
  const endDate = new Date(startDate);
  const count = Math.max(1, intervalCount);

  switch (interval) {
    case BillingInterval.DAY:
      endDate.setDate(endDate.getDate() + count);
      break;
    case BillingInterval.WEEK:
      endDate.setDate(endDate.getDate() + count * 7);
      break;
    case BillingInterval.MONTH:
      endDate.setMonth(endDate.getMonth() + count);
      break;
    case BillingInterval.YEAR:
      endDate.setFullYear(endDate.getFullYear() + count);
      break;
    default:
      endDate.setMonth(endDate.getMonth() + count);
  }

  return endDate;
}

/**
 * Calculate line item totals:
 * lineTotal = (unitPrice * quantity) - discountAmount + taxAmount
 */
export interface LineItemInput {
  quantity: number;
  unitPrice: DecimalLike;
  discountAmount?: DecimalLike;
  taxRate?: DecimalLike; // e.g. 0.0825 for 8.25%
}

export interface CalculatedLine {
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

export function calculateLineItem(item: LineItemInput): CalculatedLine {
  const quantity = Math.max(1, item.quantity);
  const unitPrice = toDecimal(item.unitPrice);
  const rawSubtotal = unitPrice.mul(quantity);
  const discountAmount = item.discountAmount ? toDecimal(item.discountAmount) : new Prisma.Decimal(0);
  
  // Base after line-level discount, not dropping below 0
  const afterDiscount = Prisma.Decimal.max(0, rawSubtotal.sub(discountAmount));
  const taxRate = item.taxRate ? new Prisma.Decimal(String(item.taxRate)) : new Prisma.Decimal(0);
  const taxAmount = toDecimal(afterDiscount.mul(taxRate));
  const totalAmount = toDecimal(afterDiscount.add(taxAmount));

  return {
    quantity,
    unitPrice,
    subtotal: toDecimal(rawSubtotal),
    discountAmount,
    taxRate,
    taxAmount,
    totalAmount,
  };
}

/**
 * Calculate totals for a collection of lines.
 */
export function calculateCollectionTotals(lines: LineItemInput[]) {
  let subtotal = new Prisma.Decimal(0);
  let totalDiscount = new Prisma.Decimal(0);
  let totalTax = new Prisma.Decimal(0);
  let grandTotal = new Prisma.Decimal(0);

  const calculatedLines = lines.map((line) => {
    const calc = calculateLineItem(line);
    subtotal = subtotal.add(calc.subtotal);
    totalDiscount = totalDiscount.add(calc.discountAmount);
    totalTax = totalTax.add(calc.taxAmount);
    grandTotal = grandTotal.add(calc.totalAmount);
    return calc;
  });

  return {
    subtotal: toDecimal(subtotal),
    discountAmount: toDecimal(totalDiscount),
    taxAmount: toDecimal(totalTax),
    totalAmount: toDecimal(grandTotal),
    calculatedLines,
  };
}
