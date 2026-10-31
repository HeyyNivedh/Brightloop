import { prisma } from '@/lib/db';
import { Prisma, QuotationStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { calculateCollectionTotals } from './calculations';
import { createSubscriptionRecord } from './subscriptions';

/**
 * Valid quotation state transitions.
 */
export const ALLOWED_QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: [QuotationStatus.SENT, QuotationStatus.ACCEPTED, QuotationStatus.REJECTED, QuotationStatus.EXPIRED],
  SENT: [QuotationStatus.ACCEPTED, QuotationStatus.REJECTED, QuotationStatus.EXPIRED],
  ACCEPTED: [], // Terminal
  REJECTED: [QuotationStatus.DRAFT], // Can reopen as draft for revisions
  EXPIRED: [QuotationStatus.DRAFT],
};

export function isValidQuotationTransition(from: QuotationStatus, to: QuotationStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_QUOTATION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export async function generateQuotationNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `QUO-${currentYear}-`;
  const count = await tx.quotation.count({
    where: { quotationNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

export interface QuotationLineInput {
  productId?: string;
  planId?: string;
  description: string;
  quantity: number;
  unitPrice: number | Prisma.Decimal;
  discountAmount?: number | Prisma.Decimal;
  taxRate?: number | Prisma.Decimal;
  sortOrder?: number;
}

export interface CreateQuotationInput {
  customerId: string;
  templateId?: string;
  validUntil: Date;
  currency?: string;
  notes?: string;
  terms?: string;
  lines: QuotationLineInput[];
}

/**
 * Create a new quotation calculating line-item totals, discounts, taxes, and grand total.
 */
export async function createQuotationRecord(
  input: CreateQuotationInput,
  tx: Prisma.TransactionClient = prisma
) {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new ValidationError('A quotation must contain at least one line item.');
  }

  const { subtotal, discountAmount, taxAmount, totalAmount, calculatedLines } = calculateCollectionTotals(
    input.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxRate: l.taxRate,
    }))
  );

  const quotationNumber = await generateQuotationNumber(tx);
  const currency = input.currency || customer.currency || 'USD';

  const quotation = await tx.quotation.create({
    data: {
      quotationNumber,
      customerId: input.customerId,
      templateId: input.templateId,
      status: QuotationStatus.DRAFT,
      validUntil: input.validUntil,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      currency,
      notes: input.notes,
      terms: input.terms,
      lines: {
        create: input.lines.map((l, index) => {
          const calc = calculatedLines[index];
          return {
            productId: l.productId,
            planId: l.planId,
            description: l.description,
            quantity: calc.quantity,
            unitPrice: calc.unitPrice,
            discountAmount: calc.discountAmount,
            taxRate: calc.taxRate,
            lineTotal: calc.totalAmount,
            sortOrder: l.sortOrder !== undefined ? l.sortOrder : index,
          };
        }),
      },
    },
    include: {
      lines: {
        include: { product: true, plan: true },
      },
      customer: true,
      template: true,
    },
  });

  return quotation;
}

/**
 * Confirm / accept quotation and automatically create subscription.
 */
export async function confirmQuotation(
  quotationId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const quotation = await tx.quotation.findUnique({
    where: { id: quotationId },
    include: { lines: true, customer: true },
  });
  if (!quotation) {
    throw new NotFoundError('Quotation');
  }

  if (quotation.status === QuotationStatus.ACCEPTED) {
    throw new ValidationError('Quotation is already accepted and confirmed.');
  }

  if (quotation.status === QuotationStatus.REJECTED || quotation.status === QuotationStatus.EXPIRED) {
    throw new ValidationError(`Cannot confirm a quotation with status ${quotation.status}.`);
  }

  // Check validUntil date
  if (new Date() > quotation.validUntil) {
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.EXPIRED },
    });
    throw new ValidationError('This quotation has expired and can no longer be confirmed.');
  }

  // Find a line that has a planId
  const planLine = quotation.lines.find((l) => l.planId);
  if (!planLine || !planLine.planId) {
    throw new ValidationError(
      'Cannot convert quotation to subscription: No line item in this quotation is linked to a subscription plan.'
    );
  }

  // Mark quotation as ACCEPTED
  const updatedQuotation = await tx.quotation.update({
    where: { id: quotationId },
    data: { status: QuotationStatus.ACCEPTED },
  });

  // Create corresponding Subscription
  const subscription = await createSubscriptionRecord(
    {
      customerId: quotation.customerId,
      planId: planLine.planId,
      currency: quotation.currency,
      lines: quotation.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxRate: l.taxRate,
      })),
      metadata: {
        sourceQuotationId: quotation.id,
        sourceQuotationNumber: quotation.quotationNumber,
      },
    },
    tx
  );

  return {
    quotation: updatedQuotation,
    subscription,
  };
}
