import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { createPaymentSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { createAuditLog } from '@/lib/api/audit';
import { PaymentMethod, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import { recordInvoicePayment } from '@/lib/billing/payments';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const statusParam = req.nextUrl.searchParams.get('status') as PaymentStatus | null;
    const customerIdParam = req.nextUrl.searchParams.get('customerId');
    const invoiceIdParam = req.nextUrl.searchParams.get('invoiceId');

    const where: Prisma.PaymentWhereInput = {};

    // Customer Isolation
    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        return apiSuccess([], 200, buildPaginationMeta(0, page, limit));
      }
      where.customerId = session.customerId;
    } else if (customerIdParam) {
      where.customerId = customerIdParam;
    }

    if (invoiceIdParam) {
      where.invoiceId = invoiceIdParam;
    }

    if (statusParam && Object.values(PaymentStatus).includes(statusParam)) {
      where.status = statusParam;
    }

    if (search) {
      where.OR = [
        { paymentNumber: { contains: search, mode: 'insensitive' } },
        { providerTransactionId: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { id: true, customerNumber: true, contactName: true, companyName: true, email: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true, totalAmount: true, amountPaid: true, amountDue: true, status: true },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return apiSuccess(payments, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const json = await req.json();
    const data = await validateRequest(createPaymentSchema, json);

    // Customer Isolation: customer can only record payment for their own account
    await requireCustomerScope(req, data.customerId);

    // Record payment and reconcile invoice atomically inside transaction
    const result = await prisma.$transaction(async (tx) => {
      return recordInvoicePayment(
        {
          invoiceId: data.invoiceId,
          customerId: data.customerId,
          amount: data.amount,
          currency: data.currency,
          paymentMethod: data.paymentMethod as PaymentMethod,
          providerTransactionId: data.providerTransactionId,
          reference: data.reference,
        },
        tx
      );
    });

    await createAuditLog({
      userId: session.userId,
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: result.payment.id,
      newValues: {
        paymentNumber: result.payment.paymentNumber,
        invoiceId: result.payment.invoiceId,
        amount: result.payment.amount,
        status: result.payment.status,
        invoiceStatus: result.invoice?.status,
        remainingDue: result.invoice?.amountDue,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(
      {
        payment: result.payment,
        invoice: result.invoice,
        message: result.invoice?.status === 'PAID' ? 'Payment processed and invoice marked PAID in full.' : 'Payment processed successfully.',
      },
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
