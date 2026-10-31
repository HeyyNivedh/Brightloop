import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireRole } from '@/lib/auth/session';
import { createTaxRuleSchema, validateRequest } from '@/lib/validation/schemas';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const country = req.nextUrl.searchParams.get('country') || undefined;
    const state = req.nextUrl.searchParams.get('state') || undefined;

    const taxRules = await prisma.taxRule.findMany({
      where: {
        active: true,
        ...(country ? { country: country.toUpperCase() } : {}),
        ...(state ? { state: state.toUpperCase() } : {}),
      },
      orderBy: { priority: 'asc' },
    });

    return apiSuccess(taxRules);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only ADMIN can configure tax rules. STAFF is explicitly forbidden.
    const session = await requireRole(req, [UserRole.ADMIN]);

    const json = await req.json();
    const data = await validateRequest(createTaxRuleSchema, json);

    const rule = await prisma.taxRule.create({
      data: {
        name: data.name,
        country: data.country.toUpperCase(),
        state: data.state?.toUpperCase(),
        postalCode: data.postalCode,
        rate: data.rate,
        isCompound: data.isCompound,
        priority: data.priority,
        active: data.active,
        description: data.description,
      },
    });

    await createAuditLog({
      userId: session.userId,
      action: 'TAX_RULE_CREATED',
      entityType: 'TaxRule',
      entityId: rule.id,
      newValues: rule,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    return apiSuccess(rule, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
