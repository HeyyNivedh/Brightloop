import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';
import { generateSubscriptionInvoice } from '@/lib/billing/invoices';
import { SubscriptionStatus, UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    // Restrict recurring batch billing invocation to ADMIN or STAFF
    const session = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);

    const json = await req.json().catch(() => ({}));
    const { subscriptionId, dueDays = 14 } = json as { subscriptionId?: string; dueDays?: number };

    // If specific subscriptionId provided, process only that one
    if (subscriptionId) {
      const { invoice, isDuplicatePrevented } = await generateSubscriptionInvoice(subscriptionId, {
        dueDays,
      });

      return apiSuccess({
        processedCount: 1,
        newInvoicesCount: isDuplicatePrevented ? 0 : 1,
        duplicatesPreventedCount: isDuplicatePrevented ? 1 : 0,
        results: [{ subscriptionId, invoice, isDuplicatePrevented }],
      });
    }

    const eligibleSubscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      },
      take: 50,
    });

    const results = [];
    let newInvoicesCount = 0;
    let duplicatesPreventedCount = 0;

    for (const sub of eligibleSubscriptions) {
      try {
        const res = await generateSubscriptionInvoice(sub.id, { dueDays });
        if (res.isDuplicatePrevented) {
          duplicatesPreventedCount++;
        } else {
          newInvoicesCount++;
        }
        results.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscriptionNumber,
          invoiceId: res.invoice.id,
          invoiceNumber: res.invoice.invoiceNumber,
          isDuplicatePrevented: res.isDuplicatePrevented,
        });
      } catch (err) {
        results.push({
          subscriptionId: sub.id,
          subscriptionNumber: sub.subscriptionNumber,
          error: (err as Error).message,
        });
      }
    }

    await createAuditLog({
      userId: session.userId,
      action: 'BATCH_BILLING_RUN',
      entityType: 'Invoice',
      entityId: 'batch',
      newValues: {
        processedCount: eligibleSubscriptions.length,
        newInvoicesCount,
        duplicatesPreventedCount,
      },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess({
      message: `Batch billing processed ${eligibleSubscriptions.length} subscriptions. Generated ${newInvoicesCount} new invoices; prevented ${duplicatesPreventedCount} duplicates.`,
      processedCount: eligibleSubscriptions.length,
      newInvoicesCount,
      duplicatesPreventedCount,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
