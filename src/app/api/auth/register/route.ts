import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { registerSchema, validateRequest } from '@/lib/validation/schemas';
import { hashPassword } from '@/lib/auth/password';
import { signSessionToken } from '@/lib/auth/tokens';
import { setSessionCookie } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { ConflictError } from '@/lib/api/errors';
import { createAuditLog } from '@/lib/api/audit';
import { withTransaction } from '@/lib/api/transaction';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const data = await validateRequest(registerSchema, json);

    // 1. Prevent duplicate registration
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictError('An account with this email address already exists.');
    }

    // 2. Hash password
    const passwordHash = await hashPassword(data.password);

    // 3. Atomically create User and Customer records in transaction
    const result = await withTransaction(async (tx) => {
      // Generate next customer number
      const customerCount = await tx.customer.count();
      const customerNumber = `CUST-${String(customerCount + 1).padStart(5, '0')}`;

      // Create User
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: UserRole.CUSTOMER,
        },
      });

      // Create linked Customer
      const newCustomer = await tx.customer.create({
        data: {
          customerNumber,
          contactName: data.name,
          email: data.email,
          companyName: data.companyName,
          phone: data.phone,
          userId: newUser.id,
        },
      });

      return { user: newUser, customer: newCustomer };
    });

    // 4. Audit log
    await createAuditLog({
      userId: result.user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: result.user.id,
      newValues: { email: data.email, role: UserRole.CUSTOMER },
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent'),
    });

    // 5. Generate session token
    const token = await signSessionToken({
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      customerId: result.customer.id,
    });

    const response = apiSuccess(
      {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          customerId: result.customer.id,
        },
        token,
      },
      201
    );

    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
