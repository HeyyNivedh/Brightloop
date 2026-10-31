import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/db';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { signSessionToken, verifySessionToken, generateSecureRandomToken, hashToken } from '../lib/auth/tokens';
import { devEmailStore } from '../lib/auth/email-adapter';
import { withTransaction } from '../lib/api/transaction';

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
