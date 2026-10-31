import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { QuotationStatus } from '@prisma/client';
import { calculateCollectionTotals } from '@/lib/billing/calculations';
import { QuotationLineInput } from '@/lib/billing/quotations';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        template: true,
        lines: {
          include: { product: true, plan: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    await requireCustomerScope(req, quotation.customerId);

    return apiSuccess(quotation);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const existing = await prisma.quotation.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) {
      throw new NotFoundError('Quotation');
    }

    await requireCustomerScope(req, existing.customerId);

    // Only DRAFT quotations can have their contents or lines modified
    if (existing.status !== QuotationStatus.DRAFT) {
      throw new ValidationError(
        `Cannot edit quotation with status ${existing.status}. Only DRAFT quotations can be modified.`
      );
    }

    const json = await req.json();
    const { notes, terms, validUntil, lines } = json as {
      notes?: string;
      terms?: string;
      validUntil?: string;
      lines?: QuotationLineInput[];
    };

    let updated;

    if (lines && lines.length > 0) {
      const { subtotal, discountAmount, taxAmount, totalAmount, calculatedLines } = calculateCollectionTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRate: l.taxRate,
        }))
      );

      // Replace lines in a transaction
      updated = await prisma.$transaction(async (tx) => {
        await tx.quotationLine.deleteMany({ where: { quotationId: id } });

        return tx.quotation.update({
          where: { id },
          data: {
            notes: notes !== undefined ? notes : existing.notes,
            terms: terms !== undefined ? terms : existing.terms,
            validUntil: validUntil ? new Date(validUntil) : existing.validUntil,
            subtotal,
            discountAmount,
            taxAmount,
            totalAmount,
            lines: {
              create: lines.map((l, index) => {
                const calc = calculatedLines[index];
                return {
                  productId: l.productId,
                  planId: l.planId,
                  description: l.description,
                  quantity: calc.quantity,
                  unitPrice: calc.unitPrice,
                  discountAmount: calc.discountAmount,
                  taxRate: calc.taxRate,
                  lineTotal: calc.totalAmount,
                  sortOrder: l.sortOrder !== undefined ? l.sortOrder : index,
                };
              }),
            },
          },
          include: { lines: true, customer: true },
        });
      });
    } else {
      updated = await prisma.quotation.update({
        where: { id },
        data: {
          notes: notes !== undefined ? notes : existing.notes,
          terms: terms !== undefined ? terms : existing.terms,
          validUntil: validUntil ? new Date(validUntil) : existing.validUntil,
        },
        include: { lines: true, customer: true },
      });
    }

    await createAuditLog({
      userId: session.userId,
      action: 'QUOTATION_UPDATED',
      entityType: 'Quotation',
      entityId: id,
      oldValues: existing,
      newValues: updated,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
