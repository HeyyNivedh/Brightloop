import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { generateSubscriptionInvoice } from '@/lib/billing/invoices';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth(req);

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundError('Subscription');
    }

    await requireCustomerScope(req, subscription.customerId);

    const json = await req.json().catch(() => ({}));
    const { dueDays, notes } = json as { dueDays?: number; notes?: string };

    const { invoice, isDuplicatePrevented } = await generateSubscriptionInvoice(id, {
      dueDays,
      notes,
    });

    if (!isDuplicatePrevented) {
      await createAuditLog({
        userId: session.userId,
        action: 'INVOICE_GENERATED_FOR_SUBSCRIPTION',
        entityType: 'Invoice',
        entityId: invoice.id,
        newValues: {
          invoiceNumber: invoice.invoiceNumber,
          subscriptionId: id,
          totalAmount: invoice.totalAmount,
        },
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent'),
      });
    }

    return apiSuccess(
      {
        invoice,
        isDuplicatePrevented,
        message: isDuplicatePrevented
          ? 'Invoice for this subscription billing period already exists. Returned existing invoice without duplicate charge.'
          : 'Invoice generated successfully.',
      },
      isDuplicatePrevented ? 200 : 201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
