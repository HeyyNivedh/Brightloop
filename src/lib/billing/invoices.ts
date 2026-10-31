import { prisma } from '@/lib/db';
import { InvoiceStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { calculateLineItem, toDecimal } from './calculations';

/**
 * Valid transitions for InvoiceStatus
 */
export const ALLOWED_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.OPEN, InvoiceStatus.VOID],
  OPEN: [InvoiceStatus.PAID, InvoiceStatus.VOID, InvoiceStatus.UNCOLLECTIBLE],
  PAID: [InvoiceStatus.OPEN], // Only if refunded
  VOID: [], // Terminal
  UNCOLLECTIBLE: [InvoiceStatus.OPEN, InvoiceStatus.VOID],
};

export function isValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_INVOICE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export async function generateInvoiceNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `INV-${currentYear}-`;
  const count = await tx.invoice.count({
    where: { invoiceNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

export interface InvoiceLineInput {
  subscriptionLineId?: string;
  description: string;
  quantity: number;
  unitPrice: number | Prisma.Decimal;
  discountAmount?: number | Prisma.Decimal;
  taxAmount?: number | Prisma.Decimal;
  taxRate?: number | Prisma.Decimal;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface CreateInvoiceInput {
  customerId: string;
  subscriptionId?: string;
  issueDate?: Date;
  dueDate: Date;
  currency?: string;
  notes?: string;
  billingAddress?: Record<string, unknown>;
  status?: InvoiceStatus;
  lines: InvoiceLineInput[];
}

/**
 * Create an invoice directly from explicit line items.
 */
export async function createInvoiceRecord(
  input: CreateInvoiceInput,
  tx: Prisma.TransactionClient = prisma
) {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new ValidationError('An invoice must have at least one line item.');
  }

  let subtotal = new Prisma.Decimal(0);
  let totalDiscount = new Prisma.Decimal(0);
  let totalTax = new Prisma.Decimal(0);
  let grandTotal = new Prisma.Decimal(0);

  const calculatedLines = input.lines.map((l) => {
    const calc = calculateLineItem({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxRate: l.taxRate,
    });

    const taxAmount = l.taxAmount !== undefined ? toDecimal(l.taxAmount) : calc.taxAmount;
    const lineTotal = toDecimal(calc.subtotal.sub(calc.discountAmount).add(taxAmount));

    subtotal = subtotal.add(calc.subtotal);
    totalDiscount = totalDiscount.add(calc.discountAmount);
    totalTax = totalTax.add(taxAmount);
    grandTotal = grandTotal.add(lineTotal);

    return {
      subscriptionLineId: l.subscriptionLineId,
      description: l.description,
      quantity: calc.quantity,
      unitPrice: calc.unitPrice,
      discountAmount: calc.discountAmount,
      taxAmount,
      totalAmount: lineTotal,
      periodStart: l.periodStart,
      periodEnd: l.periodEnd,
    };
  });

  const invoiceNumber = await generateInvoiceNumber(tx);
  const currency = input.currency || customer.currency || 'USD';
  const status = input.status || InvoiceStatus.OPEN;

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      customerId: input.customerId,
      subscriptionId: input.subscriptionId,
      status,
      issueDate: input.issueDate || new Date(),
      dueDate: input.dueDate,
      subtotal: toDecimal(subtotal),
      discountAmount: toDecimal(totalDiscount),
      taxAmount: toDecimal(totalTax),
      totalAmount: toDecimal(grandTotal),
      amountPaid: new Prisma.Decimal(0),
      amountDue: toDecimal(grandTotal),
      currency,
      notes: input.notes,
      billingAddress: input.billingAddress
        ? (input.billingAddress as Prisma.InputJsonValue)
        : (customer.billingAddress as Prisma.InputJsonValue),
      lines: {
        create: calculatedLines,
      },
    },
    include: {
      lines: true,
      customer: true,
      subscription: true,
    },
  });

  return invoice;
}

/**
 * Generate a recurring invoice from an active subscription.
 * Implements strict idempotency / duplicate protection for the same billing period.
 */
export async function generateSubscriptionInvoice(
  subscriptionId: string,
  options: { dueDays?: number; notes?: string } = {},
  tx: Prisma.TransactionClient = prisma
) {
  const subscription = await tx.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      lines: true,
      customer: true,
      plan: true,
    },
  });

  if (!subscription) {
    throw new NotFoundError('Subscription');
  }

  if (subscription.status === SubscriptionStatus.CANCELLED) {
    throw new ValidationError('Cannot generate an invoice for a cancelled subscription.');
  }

  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd;

  // 1. Idempotency Check: Prevent duplicate invoices for the same subscription period
  const existingInvoice = await tx.invoice.findFirst({
    where: {
      subscriptionId,
      status: { not: InvoiceStatus.VOID },
      lines: {
        some: {
          periodStart: { gte: new Date(periodStart.getTime() - 1000), lte: new Date(periodStart.getTime() + 1000) },
          periodEnd: { gte: new Date(periodEnd.getTime() - 1000), lte: new Date(periodEnd.getTime() + 1000) },
        },
      },
    },
    include: { lines: true, customer: true, payments: true },
  });

  if (existingInvoice) {
    return {
      invoice: existingInvoice,
      isDuplicatePrevented: true,
    };
  }

  // 2. Compute lines from subscription lines
  const dueDays = options.dueDays || 14;
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);

  const linesInput: InvoiceLineInput[] = subscription.lines.map((sLine) => ({
    subscriptionLineId: sLine.id,
    description: sLine.description,
    quantity: sLine.quantity,
    unitPrice: sLine.unitPrice,
    discountAmount: sLine.discountAmount,
    taxRate: sLine.taxRate,
    periodStart,
    periodEnd,
  }));

  const invoice = await createInvoiceRecord(
    {
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      issueDate: new Date(),
      dueDate,
      currency: subscription.currency,
      notes: options.notes || `Recurring subscription fee for ${subscription.subscriptionNumber}`,
      status: InvoiceStatus.OPEN,
      lines: linesInput,
    },
    tx
  );

  return {
    invoice,
    isDuplicatePrevented: false,
  };
}

/**
 * Update invoice status with strict validation.
 */
export async function transitionInvoiceStatus(
  invoiceId: string,
  newStatus: InvoiceStatus,
  options: { paidAt?: Date; notes?: string } = {},
  tx: Prisma.TransactionClient = prisma
) {
  const current = await tx.invoice.findUnique({
    where: { id: invoiceId },
  });
  if (!current) {
    throw new NotFoundError('Invoice');
  }

  if (!isValidInvoiceTransition(current.status, newStatus)) {
    throw new ValidationError(
      `Invalid invoice status transition from ${current.status} to ${newStatus}. Allowed transitions: [${(
        ALLOWED_INVOICE_TRANSITIONS[current.status] || []
      ).join(', ')}]`
    );
  }

  const updateData: Prisma.InvoiceUpdateInput = {
    status: newStatus,
  };

  if (newStatus === InvoiceStatus.PAID) {
    updateData.paidAt = options.paidAt || new Date();
    updateData.amountPaid = current.totalAmount;
    updateData.amountDue = new Prisma.Decimal(0);
  } else if (newStatus === InvoiceStatus.VOID) {
    updateData.amountDue = new Prisma.Decimal(0);
  }

  return tx.invoice.update({
    where: { id: invoiceId },
    data: updateData,
    include: { lines: true, customer: true, payments: true },
  });
}
