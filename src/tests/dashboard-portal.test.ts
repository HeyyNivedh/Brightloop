import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { signSessionToken } from '@/lib/auth/tokens';
import { GET as getReports } from '@/app/api/reports/route';
import { GET as getPortalSummary } from '@/app/api/portal/summary/route';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

describe('Member 4: Dashboard & Customer Portal Tests', () => {
  let adminToken: string;
  let staffToken: string;
  let customerToken: string;
  let customerId1: string;
  let customerId2: string;

  before(async () => {
    // Retrieve seeded accounts
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@brightloop.com' },
    });
    const staffUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'staff@brightloop.com' },
    });
    const customerUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer@acme.com' },
      include: { customer: true },
    });

    customerId1 = customerUser.customer!.id;

    // Find another customer for isolation verification
    const otherCustomer = await prisma.customer.findFirstOrThrow({
      where: { id: { not: customerId1 } },
    });
    customerId2 = otherCustomer.id;

    // Sign session tokens
    adminToken = await signSessionToken({
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    });

    staffToken = await signSessionToken({
      userId: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: staffUser.role,
    });

    customerToken = await signSessionToken({
      userId: customerUser.id,
      email: customerUser.email,
      name: customerUser.name,
      role: customerUser.role,
      customerId: customerId1,
    });
  });

  describe('Financial & Reporting API (/api/reports)', () => {
    test('rejects unauthenticated request with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/reports');
      const res = await getReports(req);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'UNAUTHORIZED');
    });

    test('forbids CUSTOMER role from accessing reports with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost:3000/api/reports', {
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const res = await getReports(req);
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'FORBIDDEN');
    });

    test('allows STAFF role to view reports and returns complete analytics structure', async () => {
      const req = new NextRequest('http://localhost:3000/api/reports?period=30d', {
        headers: { authorization: `Bearer ${staffToken}` },
      });
      const res = await getReports(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);

      // Verify report schema
      assert.ok(json.data.subscriptions);
      assert.strictEqual(typeof json.data.subscriptions.total, 'number');
      assert.ok(json.data.subscriptions.byStatus);
      assert.strictEqual(typeof json.data.subscriptions.byStatus.ACTIVE, 'number');

      // Verify revenue calculations
      assert.ok(json.data.revenue);
      assert.strictEqual(typeof json.data.revenue.totalCollected, 'number');
      assert.ok(Array.isArray(json.data.revenue.byPaymentMethod));
      assert.ok(Array.isArray(json.data.revenue.recentPayments));

      // Verify invoice metrics
      assert.ok(json.data.invoices);
      assert.strictEqual(typeof json.data.invoices.totalOutstanding, 'number');
      assert.ok(Array.isArray(json.data.invoices.overdueList));

      // Verify plan performance
      assert.ok(Array.isArray(json.data.planPerformance));
      assert.ok(json.data.planPerformance.length > 0);
      const plan = json.data.planPerformance[0];
      assert.ok(plan.code);
      assert.strictEqual(typeof plan.price, 'number');
    });

    test('supports different time periods (7d, 90d, all)', async () => {
      for (const p of ['7d', '90d', 'all']) {
        const req = new NextRequest(`http://localhost:3000/api/reports?period=${p}`, {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        const res = await getReports(req);
        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.data.period, p);
      }
    });
  });

  describe('Customer Portal Summary API (/api/portal/summary)', () => {
    test('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const req = new NextRequest('http://localhost:3000/api/portal/summary');
      const res = await getPortalSummary(req);
      assert.strictEqual(res.status, 401);
    });

    test('allows CUSTOMER to view their own portal data and aggregates', async () => {
      const req = new NextRequest('http://localhost:3000/api/portal/summary', {
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const res = await getPortalSummary(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();

      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.customer.id, customerId1);
      assert.ok(json.data.metrics);
      assert.strictEqual(typeof json.data.metrics.activeSubscriptionsCount, 'number');
      assert.strictEqual(typeof json.data.metrics.totalAmountDue, 'number');
      assert.ok(Array.isArray(json.data.subscriptions));
      assert.ok(Array.isArray(json.data.invoices));
      assert.ok(Array.isArray(json.data.quotations));
      assert.ok(Array.isArray(json.data.payments));
    });

    test('prevents IDOR: ignores malicious ?customerId query parameter when called by CUSTOMER', async () => {
      // Customer 1 tries to view Customer 2 by providing customerId in the query string
      const req = new NextRequest(`http://localhost:3000/api/portal/summary?customerId=${customerId2}`, {
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const res = await getPortalSummary(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();

      // Must strictly return customerId1, NOT customerId2!
      assert.strictEqual(json.data.customer.id, customerId1);
      assert.notStrictEqual(json.data.customer.id, customerId2);
    });

    test('allows ADMIN or STAFF to specify customerId for support / preview', async () => {
      const req = new NextRequest(`http://localhost:3000/api/portal/summary?customerId=${customerId2}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const res = await getPortalSummary(req);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.customer.id, customerId2);
    });
  });

  describe('UI Formatting & Utility Helpers', () => {
    test('formatCurrency formats valid numbers and decimals with currency symbol', () => {
      assert.strictEqual(formatCurrency(100), '$100.00');
      assert.strictEqual(formatCurrency(2500.5, 'USD'), '$2,500.50');
      assert.strictEqual(formatCurrency(null), '$0.00');
      assert.strictEqual(formatCurrency(undefined), '$0.00');
    });

    test('formatDate produces readable strings and handles null gracefully', () => {
      const date = new Date('2026-06-15T12:00:00Z');
      const formatted = formatDate(date);
      assert.ok(formatted.includes('2026'));
      assert.ok(formatted.includes('Jun'));
      assert.strictEqual(formatDate(null), 'N/A');
    });

    test('formatDateTime produces readable date and time strings', () => {
      const date = new Date('2026-06-15T14:30:00Z');
      const formatted = formatDateTime(date);
      assert.ok(formatted.includes('2026'));
      assert.strictEqual(formatDateTime(null), 'N/A');
    });
  });
});
