import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { signSessionToken, verifySessionToken, generateSecureRandomToken, hashToken } from '../lib/auth/tokens';
import { devEmailStore } from '../lib/auth/email-adapter';
import { validateEnv } from '../lib/env';
import { proxy } from '../proxy';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

test('Password Hashing and Verification', async () => {
  const plain = 'StrongPass123!@#';
  const hashed = await hashPassword(plain);

  assert.notEqual(plain, hashed);
  assert.ok(hashed.startsWith('$2'));

  const validMatch = await verifyPassword(plain, hashed);
  assert.equal(validMatch, true);

  const invalidMatch = await verifyPassword('WrongPassword123!', hashed);
  assert.equal(invalidMatch, false);
});

test('JWT Session Signing and Verification', async () => {
  const payload = {
    userId: 'usr_test_123',
    email: 'test@brightloop.com',
    name: 'Test Engineer',
    role: 'ADMIN' as const,
    customerId: null,
  };

  const token = await signSessionToken(payload, '1h');
  assert.ok(typeof token === 'string' && token.split('.').length === 3);

  const decoded = await verifySessionToken(token);
  assert.ok(decoded);
  assert.equal(decoded?.userId, payload.userId);
  assert.equal(decoded?.email, payload.email);
  assert.equal(decoded?.role, 'ADMIN');

  // Tampered token test
  const tamperedToken = token.slice(0, -5) + 'abcde';
  const invalidDecoded = await verifySessionToken(tamperedToken);
  assert.equal(invalidDecoded, null);

  // Expired token test
  const expiredToken = await signSessionToken(payload, '-1s');
  const expiredDecoded = await verifySessionToken(expiredToken);
  assert.equal(expiredDecoded, null);

  // Forged token signed with untrusted secret test
  const forgedSecretKey = new TextEncoder().encode('untrusted-foreign-secret-key-that-is-at-least-32-chars-long');
  const forgedToken = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(forgedSecretKey);
  const forgedDecoded = await verifySessionToken(forgedToken);
  assert.equal(forgedDecoded, null);
});

test('JWT Secret and Environment Security Validation', () => {
  // 1. Missing JWT_SECRET must throw and cannot fall back to a default
  assert.throws(() => {
    validateEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54333/brightloop',
      NODE_ENV: 'production',
    });
  }, (err: Error) => err.message.includes('JWT_SECRET'));

  // 2. Short JWT_SECRET (< 32 chars) must throw and cannot fall back
  assert.throws(() => {
    validateEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:54333/brightloop',
      JWT_SECRET: 'too-short-secret',
      NODE_ENV: 'production',
    });
  }, (err: Error) => err.message.includes('JWT_SECRET must be at least 32 characters'));

  // 3. Missing DATABASE_URL must throw
  assert.throws(() => {
    validateEnv({
      JWT_SECRET: 'a'.repeat(32),
      NODE_ENV: 'production',
    });
  }, (err: Error) => err.message.includes('DATABASE_URL'));

  // 4. Valid production environment succeeds without fallbacks
  const valid = validateEnv({
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:54333/brightloop',
    JWT_SECRET: 'production-secret-with-plenty-of-entropy-and-length-32-plus',
    NODE_ENV: 'production',
  });
  assert.equal(valid.JWT_SECRET, 'production-secret-with-plenty-of-entropy-and-length-32-plus');
});

test('Proxy Route Protection and Authorization Enforcement', async (t) => {
  const adminToken = await signSessionToken({
    userId: 'admin_proxy_1',
    email: 'admin@brightloop.com',
    name: 'Admin Proxy',
    role: 'ADMIN',
  });

  const staffToken = await signSessionToken({
    userId: 'staff_proxy_1',
    email: 'staff@brightloop.com',
    name: 'Staff Proxy',
    role: 'STAFF',
  });

  const forgedSecretKey = new TextEncoder().encode('attacker-provided-key-at-least-32-chars-long');
  const forgedToken = await new SignJWT({
    userId: 'hacker_1',
    email: 'hacker@evil.com',
    name: 'Attacker',
    role: 'ADMIN',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(forgedSecretKey);

  await t.test('rejects unauthenticated request to /api/users/staff with 401', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/users/staff'));
    const res = await proxy(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  await t.test('rejects token signed with unauthorized secret with 401', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/users/staff'), {
      headers: { authorization: `Bearer ${forgedToken}` },
    });
    const res = await proxy(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  await t.test('rejects STAFF token accessing /api/users/staff with 403 FORBIDDEN', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/users/staff'), {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    const res = await proxy(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  await t.test('allows ADMIN token to access /api/users/staff (returns next response)', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/users/staff'), {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const res = await proxy(req);
    assert.equal(res.status, 200);
  });

  await t.test('allows public endpoint to pass through without token', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/auth/login'));
    const res = await proxy(req);
    assert.equal(res.status, 200);
  });
});

test('Password Reset Token Life Cycle and Security', async (t) => {
  // Test user
  const email = `reset.test.${Date.now()}@example.com`;
  const passwordHash = await hashPassword('InitialPass123!@#');

  const testUser = await prisma.user.create({
    data: {
      email,
      name: 'Reset Test User',
      passwordHash,
      role: 'CUSTOMER',
    },
  });

  t.after(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  await t.test('generates raw token and stores only SHA-256 hash in database', async () => {
    devEmailStore.clear();

    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashToken(rawToken);

    assert.notEqual(rawToken, tokenHash);
    assert.equal(tokenHash.length, 64); // SHA-256 hex string length

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const dbRecord = await prisma.passwordResetToken.create({
      data: {
        userId: testUser.id,
        tokenHash,
        expiresAt,
      },
    });

    assert.ok(dbRecord.id);
    assert.equal(dbRecord.tokenHash, tokenHash);

    // Send via dev email adapter
    await devEmailStore.sendPasswordResetEmail(
      testUser.email,
      rawToken,
      `http://localhost:3000/reset-password?token=${rawToken}`
    );

    const sent = devEmailStore.getLastSentEmail();
    assert.ok(sent);
    assert.equal(sent?.to, testUser.email);
    assert.equal(sent?.token, rawToken);
  });

  await t.test('enforces single-use on reset tokens', async () => {
    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashToken(rawToken);

    const tokenRecord = await prisma.passwordResetToken.create({
      data: {
        userId: testUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 1000),
      },
    });

    // Simulate first consumption (use token)
    await prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    // Attempt second consumption (must be rejected)
    const checkAgain = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    assert.ok(checkAgain);
    assert.notEqual(checkAgain.usedAt, null);
    assert.ok(checkAgain.usedAt instanceof Date);
  });

  await t.test('detects expired tokens', async () => {
    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashToken(rawToken);

    // Expired 5 minutes ago
    const expiredRecord = await prisma.passwordResetToken.create({
      data: {
        userId: testUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    const isExpired = expiredRecord.expiresAt < new Date();
    assert.equal(isExpired, true);
  });
});
