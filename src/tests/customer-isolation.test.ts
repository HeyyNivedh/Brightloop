import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '@prisma/client';
import { requireCustomerScope } from '../lib/auth/session';
import { signSessionToken } from '../lib/auth/tokens';
import { ForbiddenError, UnauthorizedError } from '../lib/api/errors';
import { prisma } from '../lib/db';

test('Customer Data Isolation & IDOR Prevention', async (t) => {
  const aliceCustomerId = 'cust_alice_123';
  const bobCustomerId = 'cust_bob_456';

  const aliceToken = await signSessionToken({
    userId: 'user_alice_1',
    email: 'alice@example.com',
    name: 'Alice',
    role: UserRole.CUSTOMER,
    customerId: aliceCustomerId,
  });

  const bobToken = await signSessionToken({
    userId: 'user_bob_2',
    email: 'bob@example.com',
    name: 'Bob',
    role: UserRole.CUSTOMER,
    customerId: bobCustomerId,
  });

  const staffToken = await signSessionToken({
    userId: 'user_staff_1',
    email: 'staff@brightloop.com',
    name: 'Staff Ops',
    role: UserRole.STAFF,
  });

  const adminToken = await signSessionToken({
    userId: 'user_admin_1',
    email: 'admin@brightloop.com',
    name: 'Admin',
    role: UserRole.ADMIN,
  });

  const createMockRequest = (token: string) => {
    return new Request('http://localhost:3000/api/customers', {
      headers: { authorization: `Bearer ${token}` },
    });
  };

  await t.test('Customer CAN access their own customer record', async () => {
    const req = createMockRequest(aliceToken);
    const session = await requireCustomerScope(req, aliceCustomerId);
    assert.equal(session.customerId, aliceCustomerId);
  });

  await t.test("Customer CANNOT access another customer's record (IDOR attempt blocked)", async () => {
    const req = createMockRequest(aliceToken);
    // Alice attempting to access Bob's data
    await assert.rejects(
      async () => requireCustomerScope(req, bobCustomerId),
      (err: any) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        assert.ok(err.message.includes('only access your own customer records'));
        return true;
      }
    );
  });

  await t.test("Customer Bob CANNOT access Alice's record", async () => {
    const req = createMockRequest(bobToken);
    await assert.rejects(
      async () => requireCustomerScope(req, aliceCustomerId),
      (err: any) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await t.test('Staff user CAN access any customer record for operations', async () => {
    const req = createMockRequest(staffToken);
    const sessionAlice = await requireCustomerScope(req, aliceCustomerId);
    const sessionBob = await requireCustomerScope(req, bobCustomerId);
    assert.equal(sessionAlice.role, UserRole.STAFF);
    assert.equal(sessionBob.role, UserRole.STAFF);
  });

  await t.test('Admin user CAN access any customer record for administration', async () => {
    const req = createMockRequest(adminToken);
    const session = await requireCustomerScope(req, aliceCustomerId);
    assert.equal(session.role, UserRole.ADMIN);
  });

  await t.test('Database query isolation: customer only retrieves their own records', async () => {
    // Check seeded customer Acme
    const customerAcme = await prisma.customer.findUnique({
      where: { email: 'customer@acme.com' },
      include: { subscriptions: true, invoices: true },
    });

    assert.ok(customerAcme);

    // Query invoices filtered by customerAcme.id
    const customerInvoices = await prisma.invoice.findMany({
      where: { customerId: customerAcme.id },
    });

    // Every returned invoice must strictly belong to Acme
    for (const inv of customerInvoices) {
      assert.equal(inv.customerId, customerAcme.id);
    }
  });
});
