import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireCustomerScope } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAuth(req);

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: {
          include: { subscription: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // Customer Isolation
    await requireCustomerScope(req, payment.customerId);

    return apiSuccess(payment);
  } catch (error) {
    return handleApiError(error);
  }
}
