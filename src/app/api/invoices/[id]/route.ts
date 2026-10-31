import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        subscription: {
          include: { plan: true },
        },
        lines: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError('Invoice');
    }

    // Customer Isolation
    await requireCustomerScope(req, invoice.customerId);

    return apiSuccess(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}
