import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { UserRole, SubscriptionStatus, InvoiceStatus, PaymentStatus } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    // Only STAFF and ADMIN can view executive and operational reports
    await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const { searchParams } = req.nextUrl;
    const period = searchParams.get('period') || '30d'; // '7d', '30d', '90d', '365d', 'all'
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');

    // Calculate date filter boundaries
    let startDate: Date | undefined;
    const endDate: Date = customEnd ? new Date(customEnd) : new Date();

    if (customStart) {
      startDate = new Date(customStart);
    } else if (period === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === '365d') {
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    } // 'all' leaves startDate undefined

    const dateFilter = startDate ? { gte: startDate, lte: endDate } : { lte: endDate };

    // 1. Subscription status breakdown
    const subscriptionCounts = await prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const subscriptionsByStatus: Record<SubscriptionStatus, number> = {
      ACTIVE: 0,
      TRIALING: 0,
      PAST_DUE: 0,
      PAUSED: 0,
      CANCELLED: 0,
      EXPIRED: 0,
    };
    let totalSubscriptions = 0;
    for (const item of subscriptionCounts) {
      subscriptionsByStatus[item.status] = item._count._all;
      totalSubscriptions += item._count._all;
    }

    // 2. Revenue and Payments Metrics (in selected period)
    const [paymentsAggregate, paymentsByMethod, recentPayments] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: startDate ? { gte: startDate, lte: endDate } : undefined,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: startDate ? { gte: startDate, lte: endDate } : undefined,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, contactName: true, companyName: true, email: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      }),
    ]);

    const totalCollectedRevenue = Number(paymentsAggregate._sum.amount ?? 0);
    const successfulPaymentsCount = paymentsAggregate._count._all;

    // 3. Invoice Metrics & Overdue Analysis
    const [allInvoices, overdueInvoices] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['status'],
        where: {
          issueDate: dateFilter,
        },
        _sum: {
          totalAmount: true,
          amountDue: true,
          amountPaid: true,
        },
        _count: { _all: true },
      }),
      prisma.invoice.findMany({
        where: {
          status: InvoiceStatus.OPEN,
          dueDate: { lt: new Date() },
        },
        include: {
          customer: { select: { id: true, contactName: true, companyName: true, email: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
      }),
    ]);

    const invoiceStatusSummary: Record<
      InvoiceStatus,
      { count: number; totalAmount: number; amountDue: number; amountPaid: number }
    > = {
      DRAFT: { count: 0, totalAmount: 0, amountDue: 0, amountPaid: 0 },
      OPEN: { count: 0, totalAmount: 0, amountDue: 0, amountPaid: 0 },
      PAID: { count: 0, totalAmount: 0, amountDue: 0, amountPaid: 0 },
      VOID: { count: 0, totalAmount: 0, amountDue: 0, amountPaid: 0 },
      UNCOLLECTIBLE: { count: 0, totalAmount: 0, amountDue: 0, amountPaid: 0 },
    };

    let totalInvoicedAmount = 0;
    let totalOutstandingAmount = 0;

    for (const group of allInvoices) {
      const tot = Number(group._sum.totalAmount ?? 0);
      const due = Number(group._sum.amountDue ?? 0);
      const paid = Number(group._sum.amountPaid ?? 0);
      invoiceStatusSummary[group.status] = {
        count: group._count._all,
        totalAmount: tot,
        amountDue: due,
        amountPaid: paid,
      };
      totalInvoicedAmount += tot;
      totalOutstandingAmount += due;
    }

    const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0);

    // 4. Plan Performance & Breakdown
    const plansWithCounts = await prisma.subscriptionPlan.findMany({
      include: {
        product: { select: { id: true, name: true, code: true } },
        pricing: { where: { active: true } },
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const planPerformance = plansWithCounts.map((plan) => {
      const activePrice = plan.pricing[0];
      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        productName: plan.product.name,
        billingInterval: plan.billingInterval,
        price: activePrice ? Number(activePrice.amount) : 0,
        currency: activePrice ? activePrice.currency : 'USD',
        subscriberCount: plan._count.subscriptions,
        active: plan.active,
      };
    });

    return apiSuccess({
      period,
      dateRange: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate.toISOString(),
      },
      subscriptions: {
        total: totalSubscriptions,
        byStatus: subscriptionsByStatus,
      },
      revenue: {
        totalCollected: totalCollectedRevenue,
        successfulPaymentsCount,
        byPaymentMethod: paymentsByMethod.map((m) => ({
          method: m.paymentMethod,
          count: m._count._all,
          total: Number(m._sum.amount ?? 0),
        })),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: Number(p.amount),
          currency: p.currency,
          status: p.status,
          method: p.paymentMethod,
          paidAt: p.paidAt,
          customerName: p.customer.contactName,
          customerCompany: p.customer.companyName,
          invoiceNumber: p.invoice.invoiceNumber,
        })),
      },
      invoices: {
        totalInvoiced: totalInvoicedAmount,
        totalOutstanding: totalOutstandingAmount,
        totalOverdue: totalOverdueAmount,
        overdueCount: overdueInvoices.length,
        byStatus: invoiceStatusSummary,
        overdueList: overdueInvoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customer.contactName,
          companyName: inv.customer.companyName,
          dueDate: inv.dueDate,
          amountDue: Number(inv.amountDue),
          currency: inv.currency,
          status: inv.status,
        })),
      },
      planPerformance,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

