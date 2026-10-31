import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '@prisma/client';
import { hasPermission } from '../lib/rbac/permissions';
import { requireRole } from '../lib/auth/session';
import { signSessionToken } from '../lib/auth/tokens';
import { ForbiddenError, UnauthorizedError } from '../lib/api/errors';

test('RBAC Permission Hierarchy & Matrix', async (t) => {
  await t.test('ADMIN has superuser permissions and can manage taxes and staff', () => {
    assert.equal(hasPermission(UserRole.ADMIN, 'users:manage'), true);
    assert.equal(hasPermission(UserRole.ADMIN, 'taxes:manage'), true);
    assert.equal(hasPermission(UserRole.ADMIN, 'discounts:manage'), true);
    assert.equal(hasPermission(UserRole.ADMIN, 'staff:create'), true);
    assert.equal(hasPermission(UserRole.ADMIN, 'audit:read'), true);
  });

  await t.test('STAFF can manage operational records but CANNOT create staff or configure taxes/discounts', () => {
    // Allowed operational operations
    assert.equal(hasPermission(UserRole.STAFF, 'customers:manage'), true);
    assert.equal(hasPermission(UserRole.STAFF, 'subscriptions:manage'), true);
    assert.equal(hasPermission(UserRole.STAFF, 'invoices:manage'), true);
    assert.equal(hasPermission(UserRole.STAFF, 'payments:manage'), true);

    // Strictly Forbidden administrator actions
    assert.equal(hasPermission(UserRole.STAFF, 'staff:create'), false);
    assert.equal(hasPermission(UserRole.STAFF, 'taxes:manage'), false);
    assert.equal(hasPermission(UserRole.STAFF, 'discounts:manage'), false);
    assert.equal(hasPermission(UserRole.STAFF, 'audit:read'), false);
  });

  await t.test('CUSTOMER cannot access administrative or operational permissions', () => {
    assert.equal(hasPermission(UserRole.CUSTOMER, 'customers:read'), false);
    assert.equal(hasPermission(UserRole.CUSTOMER, 'subscriptions:read'), false);
    assert.equal(hasPermission(UserRole.CUSTOMER, 'users:manage'), false);
    assert.equal(hasPermission(UserRole.CUSTOMER, 'taxes:manage'), false);

    // Allowed customer self-scoped permissions
    assert.equal(hasPermission(UserRole.CUSTOMER, 'customer:self:read'), true);
    assert.equal(hasPermission(UserRole.CUSTOMER, 'invoices:self:read'), true);
  });
});

test('Server-Side requireRole Route Guard Enforcement', async (t) => {
  const createMockRequest = (token?: string) => {
    const headers = new Headers();
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return new Request('http://localhost:3000/api/test', { headers });
  };

  const adminToken = await signSessionToken({
    userId: 'admin_1',
    email: 'admin@brightloop.com',
    name: 'Admin',
    role: UserRole.ADMIN,
  });

  const staffToken = await signSessionToken({
    userId: 'staff_1',
    email: 'staff@brightloop.com',
    name: 'Staff',
    role: UserRole.STAFF,
  });

  const customerToken = await signSessionToken({
    userId: 'cust_user_1',
    email: 'alice@acme.com',
    name: 'Alice',
    role: UserRole.CUSTOMER,
    customerId: 'cust_record_1',
  });

  await t.test('rejects unauthenticated request with 401 UnauthorizedError', async () => {
    const req = createMockRequest();
    await assert.rejects(
      async () => requireRole(req, [UserRole.ADMIN]),
      (err: unknown) => err instanceof UnauthorizedError && err.statusCode === 401
    );
  });

  await t.test('allows ADMIN access to ADMIN-only endpoint', async () => {
    const req = createMockRequest(adminToken);
    const user = await requireRole(req, [UserRole.ADMIN]);
    assert.equal(user.role, UserRole.ADMIN);
  });

  await t.test('forbids STAFF from accessing ADMIN-only endpoint with 403 ForbiddenError', async () => {
    const req = createMockRequest(staffToken);
    await assert.rejects(
      async () => requireRole(req, [UserRole.ADMIN]),
      (err: unknown) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await t.test('forbids CUSTOMER from accessing STAFF or ADMIN endpoints with 403 ForbiddenError', async () => {
    const req = createMockRequest(customerToken);
    await assert.rejects(
      async () => requireRole(req, [UserRole.ADMIN, UserRole.STAFF]),
      (err: unknown) => err instanceof ForbiddenError && err.statusCode === 403
    );
  });

  await t.test('allows STAFF access to operational endpoints permitting STAFF or ADMIN', async () => {
    const req = createMockRequest(staffToken);
    const user = await requireRole(req, [UserRole.ADMIN, UserRole.STAFF]);
    assert.equal(user.role, UserRole.STAFF);
  });
});
