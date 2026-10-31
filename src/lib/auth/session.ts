import { UserRole } from '@prisma/client';
import { verifySessionToken } from './tokens';
import { UserSessionPayload } from '@/types/api';
import { UnauthorizedError, ForbiddenError } from '../api/errors';
import { env } from '../env';

export const AUTH_COOKIE_NAME = 'brightloop_session';

/**
 * Extract auth token from request via Authorization header or Cookie.
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Cookie header: brightloop_session=<token>
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${AUTH_COOKIE_NAME}=`)) {
        return cookie.substring(AUTH_COOKIE_NAME.length + 1).trim();
      }
    }
  }

  return null;
}

/**
 * Retrieve verified session payload from the current request.
 */
export async function getSessionUser(req: Request): Promise<UserSessionPayload | null> {
  const token = extractTokenFromRequest(req);
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Require valid authentication for an API handler.
 * Throws UnauthorizedError (401) if invalid or missing session.
 */
export async function requireAuth(req: Request): Promise<UserSessionPayload> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new UnauthorizedError('Authentication required. Please sign in to continue.');
  }
  return user;
}

/**
 * Require specific role(s) for an API handler.
 * Throws UnauthorizedError (401) if not logged in.
 * Throws ForbiddenError (403) if role is insufficient.
 */
export async function requireRole(req: Request, allowedRoles: UserRole[]): Promise<UserSessionPayload> {
  const user = await requireAuth(req);
  if (!allowedRoles.includes(user.role as UserRole)) {
    throw new ForbiddenError(
      `Access denied. This endpoint requires one of the following roles: [${allowedRoles.join(', ')}]. Your current role is: ${user.role}`
    );
  }
  return user;
}

/**
 * Enforce Customer Data Isolation (prevents IDOR):
 * - If user is CUSTOMER: they are strictly restricted to their own customerId.
 * - If user is STAFF or ADMIN: they have system-level operational access.
 */
export async function requireCustomerScope(req: Request, targetCustomerId: string): Promise<UserSessionPayload> {
  const user = await requireAuth(req);

  if (user.role === 'CUSTOMER') {
    if (!user.customerId || user.customerId !== targetCustomerId) {
      throw new ForbiddenError('Access denied: You can only access your own customer records.');
    }
  }

  return user;
}

/**
 * Set HTTP-only secure session cookie on a response.
 */
export function setSessionCookie(response: Response, token: string): void {
  const isProduction = env.NODE_ENV === 'production';
  const cookieOptions = [
    `${AUTH_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800', // 7 days in seconds
    ...(isProduction ? ['Secure'] : []),
  ];
  response.headers.append('Set-Cookie', cookieOptions.join('; '));
}

/**
 * Clear session cookie on logout.
 */
export function clearSessionCookie(response: Response): void {
  const cookieOptions = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  response.headers.append('Set-Cookie', cookieOptions.join('; '));
}
