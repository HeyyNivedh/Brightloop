import { prisma } from '@/lib/db';
import { apiSuccess, handleApiError } from '@/lib/api/response';

export async function GET() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { active: true },
      include: {
        product: true,
        variant: true,
        pricing: {
          where: { active: true },
          orderBy: { amount: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return apiSuccess(plans);
  } catch (error) {
    return handleApiError(error);
  }
}
