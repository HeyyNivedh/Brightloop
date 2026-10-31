import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCustomerScope, requireRole } from '@/lib/auth/session';
import { updateCustomerSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { CustomerStatus, Prisma, UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Enforces customer data isolation: customers can only view their own record!
    await requireCustomerScope(req, id);

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        subscriptions: {
          include: {
            plan: true,
            lines: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        invoices: {
          orderBy: { issueDate: 'desc' },
          take: 10,
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    return apiSuccess(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireCustomerScope(req, id);
    const json = await req.json();
    const data = await validateRequest(updateCustomerSchema, json);

    // If caller is CUSTOMER, prevent changing administrative fields
    if (session.role === UserRole.CUSTOMER) {
      if (data.status || data.taxExempt !== undefined || data.currency) {
        throw new ForbiddenError(
          'Customers are not permitted to change status, tax-exemption status, or billing currency directly.'
        );
      }
    }

    const existingCustomer = await prisma.customer.findUnique({ where: { id } });
    if (!existingCustomer) {
      throw new NotFoundError('Customer');
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(data.contactName ? { contactName: data.contactName } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.billingAddress ? { billingAddress: data.billingAddress as Prisma.InputJsonValue } : {}),
        ...(data.shippingAddress ? { shippingAddress: data.shippingAddress as Prisma.InputJsonValue } : {}),
        ...(data.currency && session.role !== UserRole.CUSTOMER ? { currency: data.currency } : {}),
        ...(data.taxExempt !== undefined && session.role !== UserRole.CUSTOMER ? { taxExempt: data.taxExempt } : {}),
        ...(data.status && session.role !== UserRole.CUSTOMER ? { status: data.status as CustomerStatus } : {}),
        ...(data.metadata ? { metadata: data.metadata as Prisma.InputJsonValue } : {}),
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: id,
      oldValues: existingCustomer,
      newValues: updated,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Strictly ADMIN only!
    const session = await requireRole(req, [UserRole.ADMIN]);

    const existingCustomer = await prisma.customer.findUnique({ where: { id } });
    if (!existingCustomer) {
      throw new NotFoundError('Customer');
    }

    // Soft delete / archive to preserve financial and invoice audit history
    const archived = await prisma.customer.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'CUSTOMER_ARCHIVED',
      entityType: 'Customer',
      entityId: id,
      newValues: { status: 'ARCHIVED' },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({ message: 'Customer archived successfully.', customer: archived });
  } catch (error) {
    return handleApiError(error);
  }
}
