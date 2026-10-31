import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { env } from '../env';
import { UserSessionPayload } from '@/types/api';

const secretKey = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Sign a secure JWT session token.
 */
export async function signSessionToken(payload: UserSessionPayload, expiresIn = env.JWT_EXPIRES_IN): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

/**
 * Verify and decode a JWT session token.
 */
export async function verifySessionToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as UserSessionPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Generate a cryptographically secure random token (e.g. for password resets).
 */
export function generateSecureRandomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Hash a sensitive token using SHA-256 before persisting to database.
 * The raw token is sent to user; the database only stores the SHA-256 hash.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
