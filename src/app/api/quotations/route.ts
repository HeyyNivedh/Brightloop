import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { createQuotationSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { createAuditLog } from '@/lib/api/audit';
import { Prisma, QuotationStatus, UserRole } from '@prisma/client';
import { createQuotationRecord } from '@/lib/billing/quotations';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const statusParam = req.nextUrl.searchParams.get('status') as QuotationStatus | null;
    const customerIdParam = req.nextUrl.searchParams.get('customerId');

    const where: Prisma.QuotationWhereInput = {};

    // Customer Isolation
    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        return apiSuccess([], 200, buildPaginationMeta(0, page, limit));
      }
      where.customerId = session.customerId;
    } else if (customerIdParam) {
      where.customerId = customerIdParam;
    }

    if (statusParam && Object.values(QuotationStatus).includes(statusParam)) {
      where.status = statusParam;
    }

    if (search) {
      where.OR = [
        { quotationNumber: { contains: search, mode: 'insensitive' } },
        { customer: { contactName: { contains: search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          customer: {
            select: { id: true, customerNumber: true, contactName: true, companyName: true, email: true },
          },
          lines: true,
          template: true,
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    return apiSuccess(quotations, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const json = await req.json();
    const data = await validateRequest(createQuotationSchema, json);

    // Customer isolation: if customer, ensure customerId matches their own account
    await requireCustomerScope(req, data.customerId);

    const quotation = await createQuotationRecord({
      customerId: data.customerId,
      templateId: data.templateId,
      validUntil: data.validUntil,
      currency: data.currency,
      notes: data.notes,
      terms: data.terms,
      lines: data.lines,
    });

    await createAuditLog({
      userId: session.userId,
      action: 'QUOTATION_CREATED',
      entityType: 'Quotation',
      entityId: quotation.id,
      newValues: {
        quotationNumber: quotation.quotationNumber,
        customerId: quotation.customerId,
        totalAmount: quotation.totalAmount,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(quotation, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
