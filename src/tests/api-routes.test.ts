import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as registerHandler } from '../app/api/auth/register/route';
import { POST as loginHandler } from '../app/api/auth/login/route';
import { GET as meHandler } from '../app/api/auth/me/route';
import { POST as forgotPasswordHandler } from '../app/api/auth/forgot-password/route';
import { POST as resetPasswordHandler } from '../app/api/auth/reset-password/route';
import { GET as customersHandler } from '../app/api/customers/route';
import { POST as createStaffHandler } from '../app/api/users/staff/route';
import { devEmailStore } from '../lib/auth/email-adapter';
import { prisma } from '../lib/db';
import { NextRequest } from 'next/server';

function createJsonRequest(url: string, method: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('API Route Handlers Integration Flow', async (t) => {
  const uniqueId = Date.now();
  const testEmail = `e2e.user.${uniqueId}@brightloop.com`;
  const initialPassword = 'InitialPass123!@#';
  const newPassword = 'NewSecurePass999!@#';
  let sessionToken = '';
  let customerId = '';
  let userId = '';

  t.after(async () => {
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.passwordResetToken.deleteMany({ where: { userId } });
      await prisma.customer.deleteMany({ where: { email: testEmail } });
      await prisma.user.deleteMany({ where: { email: testEmail } });
    }
  });

  await t.test('POST /api/auth/register creates user and returns 201 with session', async () => {
    const req = createJsonRequest('/api/auth/register', 'POST', {
      email: testEmail,
      password: initialPassword,
      name: 'E2E Test User',
      companyName: 'E2E Ventures',
    });

    const res = await registerHandler(req);
    assert.equal(res.status, 201);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.user.email, testEmail);
    assert.equal(json.data.user.role, 'CUSTOMER');
    assert.ok(json.data.token);

    sessionToken = json.data.token;
    customerId = json.data.user.customerId;
    userId = json.data.user.id;
  });

  await t.test('POST /api/auth/register rejects duplicate email with 409 Conflict', async () => {
    const req = createJsonRequest('/api/auth/register', 'POST', {
      email: testEmail,
      password: initialPassword,
      name: 'Duplicate Attempt',
    });

    const res = await registerHandler(req);
    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'CONFLICT');
  });

  await t.test('POST /api/auth/login validates credentials and returns session', async () => {
    const req = createJsonRequest('/api/auth/login', 'POST', {
      email: testEmail,
      password: initialPassword,
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.user.email, testEmail);
    assert.ok(json.data.token);
  });

  await t.test('POST /api/auth/login rejects incorrect password with 401', async () => {
    const req = createJsonRequest('/api/auth/login', 'POST', {
      email: testEmail,
      password: 'WrongPassword123!@#',
    });

    const res = await loginHandler(req);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  await t.test('GET /api/auth/me returns authenticated user profile & permissions', async () => {
    const req = createJsonRequest('/api/auth/me', 'GET', undefined, sessionToken);
    const res = await meHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.user.id, userId);
    assert.ok(Array.isArray(json.data.permissions));
  });

  await t.test('POST /api/auth/forgot-password sends reset token to dev adapter', async () => {
    devEmailStore.clear();

    const req = createJsonRequest('/api/auth/forgot-password', 'POST', {
      email: testEmail,
    });

    const res = await forgotPasswordHandler(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);

    const sentEmail = devEmailStore.getLastSentEmail();
    assert.ok(sentEmail);
    assert.equal(sentEmail?.to, testEmail);
    assert.ok(sentEmail?.token);

    // Consume the token to reset password
    const resetReq = createJsonRequest('/api/auth/reset-password', 'POST', {
      token: sentEmail?.token,
      newPassword,
    });

    const resetRes = await resetPasswordHandler(resetReq);
    assert.equal(resetRes.status, 200);

    // Verify login with new password
    const newLoginReq = createJsonRequest('/api/auth/login', 'POST', {
      email: testEmail,
      password: newPassword,
    });
    const newLoginRes = await loginHandler(newLoginReq);
    assert.equal(newLoginRes.status, 200);
  });

  await t.test('GET /api/customers isolates customer records', async () => {
    // Call as CUSTOMER
    const customerReq = createJsonRequest('/api/customers', 'GET', undefined, sessionToken);
    const customerRes = await customersHandler(customerReq);
    assert.equal(customerRes.status, 200);

    const customerJson = await customerRes.json();
    assert.equal(customerJson.success, true);
    // Customer must ONLY receive 1 record: their own!
    assert.equal(customerJson.data.length, 1);
    assert.equal(customerJson.data[0].id, customerId);
  });

  await t.test('POST /api/users/staff forbids staff from creating staff (requires ADMIN)', async () => {
    // Attempt to create staff using a CUSTOMER token
    const req = createJsonRequest(
      '/api/users/staff',
      'POST',
      {
        email: `staff.test.${Date.now()}@brightloop.com`,
        name: 'New Staff',
        password: 'StaffPassword123!@#',
        role: 'STAFF',
      },
      sessionToken
    );

    const res = await createStaffHandler(req);
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'FORBIDDEN');
  });
});
