import { prisma } from '@/lib/db';
import { InvoiceStatus, PaymentMethod, PaymentStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { toDecimal } from './calculations';

export async function generatePaymentNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `PAY-${currentYear}-`;
  const count = await tx.payment.count({
    where: { paymentNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

export interface RecordPaymentInput {
  invoiceId: string;
  customerId: string;
  amount: number | Prisma.Decimal;
  currency?: string;
  paymentMethod?: PaymentMethod;
  providerTransactionId?: string;
  reference?: string;
  status?: PaymentStatus;
}

/**
 * Record a payment against an invoice and reconcile balances atomically.
 */
export async function recordInvoicePayment(
  input: RecordPaymentInput,
  tx: Prisma.TransactionClient = prisma
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { subscription: true, customer: true },
  });

  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  // Customer match validation
  if (invoice.customerId !== input.customerId) {
    throw new ValidationError('Customer ID does not match the invoice customer.');
  }

  // Invoice status check: only OPEN or DRAFT invoices can accept payments
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.UNCOLLECTIBLE) {
    throw new ValidationError(`Cannot record payment on an invoice with status ${invoice.status}.`);
  }

  if (invoice.status === InvoiceStatus.PAID || invoice.amountDue.lte(0)) {
    throw new ValidationError('This invoice is already fully paid.');
  }

  const paymentAmount = toDecimal(input.amount);
  if (paymentAmount.lte(0)) {
    throw new ValidationError('Payment amount must be greater than zero.');
  }

  // Prevent overpayment
  if (paymentAmount.gt(invoice.amountDue)) {
    throw new ValidationError(
      `Payment amount (${paymentAmount.toString()}) exceeds outstanding invoice balance of ${invoice.amountDue.toString()}.`
    );
  }

  // Check duplicate providerTransactionId if provided
  if (input.providerTransactionId) {
    const existing = await tx.payment.findUnique({
      where: { providerTransactionId: input.providerTransactionId },
    });
    if (existing) {
      throw new ConflictError(
        `A payment with transaction ID ${input.providerTransactionId} has already been recorded.`
      );
    }
  }

  // Check duplicate reference if provided
  if (input.reference) {
    const existingRef = await tx.payment.findFirst({
      where: {
        invoiceId: input.invoiceId,
        reference: input.reference,
        status: PaymentStatus.SUCCEEDED,
      },
    });
    if (existingRef) {
      throw new ConflictError(
        `A succeeded payment with reference "${input.reference}" has already been applied to this invoice.`
      );
    }
  }

  const paymentNumber = await generatePaymentNumber(tx);
  const status = input.status || PaymentStatus.SUCCEEDED;
  const isPaid = status === PaymentStatus.SUCCEEDED;

  const payment = await tx.payment.create({
    data: {
      paymentNumber,
      invoiceId: input.invoiceId,
      customerId: input.customerId,
      amount: paymentAmount,
      currency: input.currency || invoice.currency,
      status,
      paymentMethod: input.paymentMethod || PaymentMethod.CREDIT_CARD,
      providerTransactionId: input.providerTransactionId,
      reference: input.reference,
      paidAt: isPaid ? new Date() : null,
    },
  });

  // Reconcile Invoice if payment succeeded
  if (isPaid) {
    const newAmountPaid = invoice.amountPaid.add(paymentAmount);
    const newAmountDue = invoice.amountDue.sub(paymentAmount);
    const isFullyPaid = newAmountDue.lte(0);

    await tx.invoice.update({
      where: { id: input.invoiceId },
      data: {
        amountPaid: newAmountPaid,
        amountDue: Prisma.Decimal.max(0, newAmountDue),
        status: isFullyPaid ? InvoiceStatus.PAID : invoice.status,
        paidAt: isFullyPaid ? new Date() : invoice.paidAt,
      },
    });

    // If invoice is associated with a subscription that was PAST_DUE, check if subscription can resume ACTIVE
    if (invoice.subscriptionId && invoice.subscription?.status === SubscriptionStatus.PAST_DUE) {
      const remainingPastDueInvoices = await tx.invoice.count({
        where: {
          subscriptionId: invoice.subscriptionId,
          status: InvoiceStatus.OPEN,
          dueDate: { lt: new Date() },
          amountDue: { gt: 0 },
        },
      });

      if (remainingPastDueInvoices === 0) {
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: { status: SubscriptionStatus.ACTIVE },
        });
      }
    }
  }

  return {
    payment,
    invoice: await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { payments: true },
    }),
  };
}

/**
 * Reconcile payment status update (e.g. refunding or failing a pending payment)
 */
export async function updatePaymentStatusRecord(
  paymentId: string,
  newStatus: PaymentStatus,
  options: { failureReason?: string; paidAt?: Date } = {},
  tx: Prisma.TransactionClient = prisma
) {
  const current = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: true },
  });
  if (!current) {
    throw new NotFoundError('Payment');
  }

  if (current.status === newStatus) {
    return current;
  }

  // Handle REFUND: Revert invoice balances
  if (newStatus === PaymentStatus.REFUNDED && current.status === PaymentStatus.SUCCEEDED) {
    const invoice = current.invoice;
    const newAmountPaid = Prisma.Decimal.max(0, invoice.amountPaid.sub(current.amount));
    const newAmountDue = invoice.amountDue.add(current.amount);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        status: InvoiceStatus.OPEN,
        paidAt: null,
      },
    });
  }

  // Handle transition from PENDING -> SUCCEEDED
  if (newStatus === PaymentStatus.SUCCEEDED && current.status === PaymentStatus.PENDING) {
    const invoice = current.invoice;
    const newAmountPaid = invoice.amountPaid.add(current.amount);
    const newAmountDue = invoice.amountDue.sub(current.amount);
    const isFullyPaid = newAmountDue.lte(0);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: Prisma.Decimal.max(0, newAmountDue),
        status: isFullyPaid ? InvoiceStatus.PAID : invoice.status,
        paidAt: isFullyPaid ? new Date() : invoice.paidAt,
      },
    });
  }

  return tx.payment.update({
    where: { id: paymentId },
    data: {
      status: newStatus,
      failureReason: options.failureReason,
      paidAt: newStatus === PaymentStatus.SUCCEEDED ? options.paidAt || new Date() : current.paidAt,
    },
    include: { invoice: true, customer: true },
  });
}
