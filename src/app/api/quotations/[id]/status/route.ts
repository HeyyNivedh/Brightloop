import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope, requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { updateQuotationStatusSchema, validateRequest } from '@/lib/validation/schemas';
import { isValidQuotationTransition } from '@/lib/billing/quotations';
import { QuotationStatus, UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Quotation');
    }

    await requireCustomerScope(req, existing.customerId);

    const json = await req.json();
    const data = await validateRequest(updateQuotationStatusSchema, json);

    // If caller is CUSTOMER:
    // Customers can reject or accept a quotation (confirming through confirm endpoint), but sending is STAFF/ADMIN
    if (session.role === UserRole.CUSTOMER && data.status === QuotationStatus.SENT) {
      await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);
    }

    if (!isValidQuotationTransition(existing.status, data.status as QuotationStatus)) {
      throw new ValidationError(
        `Invalid quotation status transition from ${existing.status} to ${data.status}.`
      );
    }

    const updated = await prisma.quotation.update({
      where: { id },
      data: { status: data.status as QuotationStatus },
      include: { lines: true, customer: true },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'QUOTATION_STATUS_CHANGED',
      entityType: 'Quotation',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
