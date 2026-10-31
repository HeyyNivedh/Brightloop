import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { createCustomerSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { getPaginationParams, buildPaginationMeta } from '@/lib/api/pagination';
import { ConflictError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { CustomerStatus, Prisma, UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { page, limit, skip, sortBy = 'createdAt', sortOrder = 'desc', search } = getPaginationParams(req.nextUrl);
    const statusParam = req.nextUrl.searchParams.get('status') as CustomerStatus | null;

    let where: Prisma.CustomerWhereInput = {};

    // Customer Data Isolation:
    // If the caller is a CUSTOMER, restrict strictly to their own linked customer record!
    if (session.role === UserRole.CUSTOMER) {
      if (!session.customerId) {
        return apiSuccess([], 200, buildPaginationMeta(0, page, limit));
      }
      where = { id: session.customerId };
    } else {
      // ADMIN & STAFF have full operational visibility
      where = {
        ...(statusParam && Object.values(CustomerStatus).includes(statusParam) ? { status: statusParam } : {}),
        ...(search
          ? {
              OR: [
                { contactName: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { customerNumber: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              subscriptions: true,
              invoices: true,
              payments: true,
            },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return apiSuccess(customers, 200, buildPaginationMeta(total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only STAFF and ADMIN can create customer accounts directly via API
    const session = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const json = await req.json();
    const data = await validateRequest(createCustomerSchema, json);

    // Prevent duplicate customer email
    const existing = await prisma.customer.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictError('A customer with this email address already exists.');
    }

    const count = await prisma.customer.count();
    const customerNumber = `CUST-${String(count + 1).padStart(5, '0')}`;

    const newCustomer = await prisma.customer.create({
      data: {
        customerNumber,
        contactName: data.contactName,
        email: data.email,
        companyName: data.companyName,
        phone: data.phone,
        currency: data.currency,
        taxExempt: data.taxExempt,
        billingAddress: data.billingAddress ? (data.billingAddress as any) : undefined,
        shippingAddress: data.shippingAddress ? (data.shippingAddress as any) : undefined,
        metadata: data.metadata ? (data.metadata as any) : undefined,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: newCustomer.id,
      newValues: { customerNumber: newCustomer.customerNumber, email: newCustomer.email },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(newCustomer, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
