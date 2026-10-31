import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './session';
import { verifySessionToken } from './tokens';
import { UserSessionPayload } from '@/types/api';
import { prisma } from '../db';

export async function getCurrentUserSession(): Promise<{
  session: UserSessionPayload | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
    customer?: {
      id: string;
      customerNumber: string;
      companyName: string | null;
    } | null;
  } | null;
}> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) {
      return { session: null, user: null };
    }

    const session = await verifySessionToken(token);
    if (!session) {
      return { session: null, user: null };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        customer: {
          select: {
            id: true,
            customerNumber: true,
            companyName: true,
          },
        },
      },
    });

    return { session, user };
  } catch {
    return { session: null, user: null };
  }
}

