import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { createInvoiceSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { createAuditLog } from '@/lib/api/audit';
import { InvoiceStatus, Prisma, UserRole } from '@prisma/client';
import { createInvoiceRecord } from '@/lib/billing/invoices';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const statusParam = req.nextUrl.searchParams.get('status') as InvoiceStatus | null;
    const customerIdParam = req.nextUrl.searchParams.get('customerId');
    const subscriptionIdParam = req.nextUrl.searchParams.get('subscriptionId');
    const overdueParam = req.nextUrl.searchParams.get('overdue');

    const where: Prisma.InvoiceWhereInput = {};

    // Customer Isolation
    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        return apiSuccess([], 200, buildPaginationMeta(0, page, limit));
      }
      where.customerId = session.customerId;
    } else if (customerIdParam) {
      where.customerId = customerIdParam;
    }

    if (subscriptionIdParam) {
      where.subscriptionId = subscriptionIdParam;
    }

    if (statusParam && Object.values(InvoiceStatus).includes(statusParam)) {
      where.status = statusParam;
    }

    // Overdue filter: OPEN invoices whose dueDate has passed and amountDue > 0
    if (overdueParam === 'true') {
      where.status = InvoiceStatus.OPEN;
      where.dueDate = { lt: new Date() };
      where.amountDue = { gt: 0 };
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { contactName: { contains: search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { id: true, customerNumber: true, contactName: true, companyName: true, email: true },
          },
          subscription: {
            select: { id: true, subscriptionNumber: true, status: true },
          },
          lines: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            select: { id: true, paymentNumber: true, amount: true, paidAt: true },
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return apiSuccess(invoices, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only STAFF or ADMIN can generate manual/ad-hoc invoices
    const session = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const json = await req.json();
    const data = await validateRequest(createInvoiceSchema, json);

    const invoice = await createInvoiceRecord({
      customerId: data.customerId,
      subscriptionId: data.subscriptionId,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      currency: data.currency,
      notes: data.notes,
      lines: data.lines,
    });

    await createAuditLog({
      userId: session.userId,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      newValues: {
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        totalAmount: invoice.totalAmount,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(invoice, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
