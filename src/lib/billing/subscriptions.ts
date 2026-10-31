import { prisma } from '@/lib/db';
import { BillingInterval, Prisma, SubscriptionStatus } from '@prisma/client';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { calculatePeriodEnd, toDecimal } from './calculations';

/**
 * Strict state machine mapping for SubscriptionStatus transitions.
 */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  ACTIVE: [
    SubscriptionStatus.PAUSED,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.EXPIRED,
  ],
  PAUSED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  PAST_DUE: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED],
  CANCELLED: [], // Terminal closed state
  EXPIRED: [SubscriptionStatus.ACTIVE], // Can be reactivated via renewal
};

export function isValidSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Generate a unique sequential subscription number: SUB-YYYY-XXXXX
 */
export async function generateSubscriptionNumber(tx: Prisma.TransactionClient = prisma): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `SUB-${currentYear}-`;
  const count = await tx.subscription.count({
    where: {
      subscriptionNumber: { startsWith: prefix },
    },
  });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  currency?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  autoRenew?: boolean;
  metadata?: Record<string, unknown>;
  lines?: Array<{
    description: string;
    quantity?: number;
    unitPrice: number | Prisma.Decimal;
    discountAmount?: number | Prisma.Decimal;
    taxRate?: number | Prisma.Decimal;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Create a new subscription with calculated period dates and lines.
 */
export async function createSubscriptionRecord(
  input: CreateSubscriptionInput,
  tx: Prisma.TransactionClient = prisma
) {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId },
  });
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  const plan = await tx.subscriptionPlan.findUnique({
    where: { id: input.planId },
    include: {
      pricing: { where: { active: true }, orderBy: { amount: 'asc' } },
    },
  });
  if (!plan) {
    throw new NotFoundError('Subscription plan');
  }

  const now = new Date();
  const periodStart = input.currentPeriodStart || now;
  const currency = input.currency || customer.currency || 'USD';

  // Determine trial dates if applicable
  let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
  let trialStart: Date | null = null;
  let trialEnd: Date | null = null;

  if (plan.trialPeriodDays > 0) {
    status = SubscriptionStatus.TRIALING;
    trialStart = input.trialStart || now;
    trialEnd = input.trialEnd || new Date(now.getTime() + plan.trialPeriodDays * 24 * 60 * 60 * 1000);
  }

  // Calculate period end if not provided
  const periodEnd =
    input.currentPeriodEnd ||
    calculatePeriodEnd(periodStart, plan.billingInterval as BillingInterval, plan.intervalCount);

  // Generate unique number
  const subscriptionNumber = await generateSubscriptionNumber(tx);

  // Determine default line if no lines specified
  let linesToCreate = input.lines || [];
  if (linesToCreate.length === 0) {
    const activePricing = plan.pricing[0];
    const unitPrice = activePricing ? activePricing.amount : new Prisma.Decimal(0);
    linesToCreate = [
      {
        description: `${plan.name} (${plan.billingInterval})`,
        quantity: 1,
        unitPrice,
        discountAmount: 0,
        taxRate: 0,
      },
    ];
  }

  const subscription = await tx.subscription.create({
    data: {
      subscriptionNumber,
      customerId: input.customerId,
      planId: input.planId,
      status,
      currency,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      trialStart,
      trialEnd,
      autoRenew: input.autoRenew !== undefined ? input.autoRenew : true,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      lines: {
        create: linesToCreate.map((line) => {
          const qty = line.quantity || 1;
          const price = toDecimal(line.unitPrice);
          const discount = toDecimal(line.discountAmount || 0);
          const tax = toDecimal(line.taxRate || 0);
          const amount = toDecimal(price.mul(qty).sub(discount));
          return {
            description: line.description,
            quantity: qty,
            unitPrice: price,
            discountAmount: discount,
            taxRate: tax,
            amount,
            metadata: line.metadata ? (line.metadata as Prisma.InputJsonValue) : undefined,
          };
        }),
      },
    },
    include: {
      lines: true,
      plan: true,
      customer: true,
    },
  });

  return subscription;
}

/**
 * Transition subscription state with strict validation.
 */
export async function transitionSubscription(
  subscriptionId: string,
  newStatus: SubscriptionStatus,
  options: { cancelAtPeriodEnd?: boolean; reason?: string } = {},
  tx: Prisma.TransactionClient = prisma
) {
  const current = await tx.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!current) {
    throw new NotFoundError('Subscription');
  }

  if (options.cancelAtPeriodEnd) {
    return tx.subscription.update({
      where: { id: subscriptionId },
      data: { cancelAtPeriodEnd: true },
      include: { lines: true, plan: true },
    });
  }

  if (!isValidSubscriptionTransition(current.status, newStatus)) {
    throw new ValidationError(
      `Invalid subscription lifecycle transition from ${current.status} to ${newStatus}. Allowed transitions: [${(
        ALLOWED_SUBSCRIPTION_TRANSITIONS[current.status] || []
      ).join(', ')}]`
    );
  }

  const updateData: Prisma.SubscriptionUpdateInput = {
    status: newStatus,
  };

  if (newStatus === SubscriptionStatus.CANCELLED) {
    updateData.cancelledAt = new Date();
    updateData.autoRenew = false;
  } else if (newStatus === SubscriptionStatus.PAUSED) {
    updateData.pausedAt = new Date();
  } else if (newStatus === SubscriptionStatus.ACTIVE && current.status === SubscriptionStatus.PAUSED) {
    updateData.pausedAt = null;
  }

  return tx.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
    include: { lines: true, plan: true, customer: true },
  });
}

/**
 * Renew an active subscription for the next period cycle.
 */
export async function renewSubscriptionCycle(
  subscriptionId: string,
  tx: Prisma.TransactionClient = prisma
) {
  const subscription = await tx.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true, lines: true },
  });
  if (!subscription) {
    throw new NotFoundError('Subscription');
  }

  if (subscription.status === SubscriptionStatus.CANCELLED) {
    throw new ValidationError('Cannot renew a cancelled subscription.');
  }

  const newStart = subscription.currentPeriodEnd;
  const newEnd = calculatePeriodEnd(
    newStart,
    subscription.plan.billingInterval as BillingInterval,
    subscription.plan.intervalCount
  );

  return tx.subscription.update({
    where: { id: subscriptionId },
    data: {
      currentPeriodStart: newStart,
      currentPeriodEnd: newEnd,
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    },
    include: { lines: true, plan: true },
  });
}
