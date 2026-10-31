import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    // Determine target customerId
    let targetCustomerId: string | null = null;

    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        throw new ForbiddenError('No customer profile associated with this account.');
      }
      targetCustomerId = session.customerId;
    } else {
      // ADMIN & STAFF can specify a customerId or default to the first customer for preview
      const requestedId = req.nextUrl.searchParams.get('customerId');
      if (requestedId) {
        targetCustomerId = requestedId;
      } else {
        const firstCust = await prisma.customer.findFirst({
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        targetCustomerId = firstCust?.id ?? null;
      }
    }

    if (!targetCustomerId) {
      throw new NotFoundError('Customer');
    }

    // Fetch complete customer domain data for the self-service portal
    const customer = await prisma.customer.findUnique({
      where: { id: targetCustomerId },
      include: {
        subscriptions: {
          include: {
            plan: {
              include: {
                product: true,
                pricing: { where: { active: true } },
              },
            },
            lines: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        quotations: {
          include: {
            lines: {
              include: {
                product: true,
                plan: true,
              },
            },
            template: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          include: {
            lines: true,
            payments: true,
          },
          orderBy: { issueDate: 'desc' },
        },
        payments: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                issueDate: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    // Calculate aggregated metrics for customer dashboard summary
    const activeSubscriptions = customer.subscriptions.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TRIALING'
    );
    const totalAmountDue = customer.invoices
      .filter((inv) => inv.status === 'OPEN')
      .reduce((sum, inv) => sum + Number(inv.amountDue), 0);
    const totalPaid = customer.payments
      .filter((p) => p.status === 'SUCCEEDED')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return apiSuccess({
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        contactName: customer.contactName,
        companyName: customer.companyName,
        email: customer.email,
        phone: customer.phone,
        currency: customer.currency,
        taxExempt: customer.taxExempt,
        status: customer.status,
        billingAddress: customer.billingAddress,
        shippingAddress: customer.shippingAddress,
      },
      metrics: {
        activeSubscriptionsCount: activeSubscriptions.length,
        totalInvoicesCount: customer.invoices.length,
        openInvoicesCount: customer.invoices.filter((i) => i.status === 'OPEN').length,
        totalQuotationsCount: customer.quotations.length,
        totalAmountDue,
        totalPaid,
      },
      subscriptions: customer.subscriptions,
      quotations: customer.quotations,
      invoices: customer.invoices,
      payments: customer.payments,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

