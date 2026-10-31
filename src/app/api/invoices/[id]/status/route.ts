import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { updateInvoiceStatusSchema, validateRequest } from '@/lib/validation/schemas';
import { transitionInvoiceStatus } from '@/lib/billing/invoices';
import { InvoiceStatus, UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Changing invoice status directly (e.g. voiding or declaring uncollectible) requires STAFF or ADMIN
    const session = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Invoice');
    }

    const json = await req.json();
    const data = await validateRequest(updateInvoiceStatusSchema, json);

    const updated = await transitionInvoiceStatus(id, data.status as InvoiceStatus, {
      paidAt: data.paidAt,
    });

    await createAuditLog({
      userId: session.userId,
      action: 'INVOICE_STATUS_CHANGED',
      entityType: 'Invoice',
      entityId: id,
      oldValues: { status: existing.status, amountDue: existing.amountDue },
      newValues: { status: updated.status, amountDue: updated.amountDue },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
