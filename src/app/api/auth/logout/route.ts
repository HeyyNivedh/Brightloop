import { NextRequest } from 'next/server';
import { clearSessionCookie, getSessionUser } from '@/lib/auth/session';
import { apiSuccess, handleApiError } from '@/lib/api/response';
import { createAuditLog } from '@/lib/api/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (user) {
      await createAuditLog({
        userId: user.userId,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: user.userId,
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        userAgent: req.headers.get('user-agent'),
      });
    }

    const response = apiSuccess({ message: 'Logged out successfully.' });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
