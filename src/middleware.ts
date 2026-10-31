import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const AUTH_COOKIE_NAME = 'brightloop_session';
const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || 'brightloop-super-secret-jwt-key-for-development-change-in-prod-min-32-chars'
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected administrative and internal API routes
  const isAdminRoute = pathname.startsWith('/api/users/staff') || pathname.startsWith('/api/audit-logs');
  
  if (isAdminRoute) {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.substring(7).trim()
      : cookieToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please sign in.',
          },
        },
        { status: 401 }
      );
    }

    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (pathname.startsWith('/api/users/staff') && payload.role !== 'ADMIN') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Staff accounts can only be created by system administrators.',
            },
          },
          { status: 403 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired session token.',
          },
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/users/staff/:path*', '/api/audit-logs/:path*'],
};
