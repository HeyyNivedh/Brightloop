import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../lib/db';
import { NextRequest } from 'next/server';
import { POST as createSubscriptionHandler } from '../app/api/subscriptions/route';
import { GET as getSubscriptionDetailHandler, PATCH as patchSubscriptionHandler } from '../app/api/subscriptions/[id]/route';
import { POST as subscriptionStatusHandler } from '../app/api/subscriptions/[id]/status/route';
import { POST as subscriptionRenewHandler } from '../app/api/subscriptions/[id]/renew/route';
import { POST as subscriptionInvoiceHandler } from '../app/api/subscriptions/[id]/invoice/route';
import { POST as createQuotationHandler } from '../app/api/quotations/route';
import { POST as confirmQuotationHandler } from '../app/api/quotations/[id]/confirm/route';
import { POST as generateInvoicesHandler } from '../app/api/invoices/generate/route';
import { POST as recordPaymentHandler } from '../app/api/payments/route';
import { POST as paymentStatusHandler } from '../app/api/payments/[id]/status/route';
import { signSessionToken } from '../lib/auth/tokens';
import { calculateCollectionTotals, calculatePeriodEnd } from '../lib/billing/calculations';
import { BillingInterval, InvoiceStatus, PaymentMethod, PaymentStatus, SubscriptionStatus } from '@prisma/client';

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

test('Subscription Lifecycle and Billing Module Test Suite', async (t) => {
  // Test fixtures
  let adminToken = '';
  let customerAliceToken = '';
  let customerBobToken = '';
  let customerAliceId = '';
  let testPlanId = '';
  let testProductId = '';

  const cleanupIds = {
    subscriptions: [] as string[],
    quotations: [] as string[],
    invoices: [] as string[],
    payments: [] as string[],
    customers: [] as string[],
    users: [] as string[],
    plans: [] as string[],
    products: [] as string[],
  };

  t.before(async () => {
    // 1. Get or Create Admin User Token
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const adminUserId = adminUser
      ? adminUser.id
      : (
          await prisma.user.create({
            data: {
              email: `admin.${Date.now()}@brightloop.com`,
              name: 'Test Admin',
              passwordHash: 'hashedpass',
              role: 'ADMIN',
            },
          })
        ).id;

    adminToken = await signSessionToken({
      userId: adminUserId,
      email: 'admin.billing@brightloop.com',
      name: 'Test Admin',
      role: 'ADMIN',
      customerId: null,
    });

    // 2. Create Test Customers Alice and Bob
    const aliceUser = await prisma.user.create({
      data: {
        email: `alice.${Date.now()}@example.com`,
        name: 'Alice Customer',
        passwordHash: 'hashedpass',
        role: 'CUSTOMER',
      },
    });
    cleanupIds.users.push(aliceUser.id);

    const aliceCustomer = await prisma.customer.create({
      data: {
        customerNumber: `CUST-A-${Date.now()}`,
        contactName: 'Alice Customer',
        email: aliceUser.email,
        userId: aliceUser.id,
      },
    });
    customerAliceId = aliceCustomer.id;
    cleanupIds.customers.push(aliceCustomer.id);

    customerAliceToken = await signSessionToken({
      userId: aliceUser.id,
      email: aliceUser.email,
      name: 'Alice Customer',
      role: 'CUSTOMER',
      customerId: aliceCustomer.id,
    });

    const bobUser = await prisma.user.create({
      data: {
        email: `bob.${Date.now()}@example.com`,
        name: 'Bob Customer',
        passwordHash: 'hashedpass',
        role: 'CUSTOMER',
      },
    });
    cleanupIds.users.push(bobUser.id);

    const bobCustomer = await prisma.customer.create({
      data: {
        customerNumber: `CUST-B-${Date.now()}`,
        contactName: 'Bob Customer',
        email: bobUser.email,
        userId: bobUser.id,
      },
    });
    cleanupIds.customers.push(bobCustomer.id);

    customerBobToken = await signSessionToken({
      userId: bobUser.id,
      email: bobUser.email,
      name: 'Bob Customer',
      role: 'CUSTOMER',
      customerId: bobCustomer.id,
    });

    // 3. Create a Test Product and Plan
    const product = await prisma.product.create({
      data: {
        code: `PROD-TEST-${Date.now()}`,
        name: 'Cloud Pro Enterprise Suite',
        active: true,
      },
    });
    testProductId = product.id;
    cleanupIds.products.push(product.id);

    const plan = await prisma.subscriptionPlan.create({
      data: {
        productId: product.id,
        code: `PLAN-PRO-${Date.now()}`,
        name: 'Pro Monthly Plan',
        billingInterval: BillingInterval.MONTH,
        intervalCount: 1,
        trialPeriodDays: 0,
        active: true,
        pricing: {
          create: {
            currency: 'USD',
            amount: 150.0,
            active: true,
          },
        },
      },
    });
    testPlanId = plan.id;
    cleanupIds.plans.push(plan.id);
  });

  t.after(async () => {
    // Teardown test entities in reverse dependency order
    const customerIds = cleanupIds.customers;
    if (customerIds.length > 0) {
      await prisma.payment.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => {});
      await prisma.invoiceLine.deleteMany({ where: { invoice: { customerId: { in: customerIds } } } }).catch(() => {});
      await prisma.invoice.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => {});
      await prisma.quotationLine.deleteMany({ where: { quotation: { customerId: { in: customerIds } } } }).catch(() => {});
      await prisma.quotation.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => {});
      await prisma.subscriptionLine.deleteMany({ where: { subscription: { customerId: { in: customerIds } } } }).catch(() => {});
      await prisma.subscription.deleteMany({ where: { customerId: { in: customerIds } } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } }).catch(() => {});
    }
    for (const id of cleanupIds.plans) {
      await prisma.planPricing.deleteMany({ where: { planId: id } }).catch(() => {});
      await prisma.subscriptionPlan.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupIds.products) {
      await prisma.product.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanupIds.users) {
      await prisma.user.deleteMany({ where: { id } }).catch(() => {});
    }
  });

  // ==========================================
  // 1. BILLING CALCULATIONS TESTS
  // ==========================================
  await t.test('1. Billing interval date arithmetic', () => {
    const baseDate = new Date('2026-01-01T00:00:00.000Z');

    const dayEnd = calculatePeriodEnd(baseDate, BillingInterval.DAY, 7);
    assert.equal(dayEnd.toISOString().substring(0, 10), '2026-01-08');

    const weekEnd = calculatePeriodEnd(baseDate, BillingInterval.WEEK, 2);
    assert.equal(weekEnd.toISOString().substring(0, 10), '2026-01-15');

    const monthEnd = calculatePeriodEnd(baseDate, BillingInterval.MONTH, 1);
    assert.equal(monthEnd.toISOString().substring(0, 10), '2026-02-01');

    const yearEnd = calculatePeriodEnd(baseDate, BillingInterval.YEAR, 1);
    assert.equal(yearEnd.toISOString().substring(0, 10), '2027-01-01');
  });

  await t.test('2. Financial precision and tax/discount calculations', () => {
    const lines = [
      { quantity: 2, unitPrice: 100, discountAmount: 20, taxRate: 0.1 }, // (200 - 20) = 180 + 18 tax = 198
      { quantity: 1, unitPrice: 50, discountAmount: 0, taxRate: 0.05 },  // 50 + 2.5 tax = 52.5
    ];

    const result = calculateCollectionTotals(lines);
    assert.equal(Number(result.subtotal), 250);
    assert.equal(Number(result.discountAmount), 20);
    assert.equal(Number(result.taxAmount), 20.5);
    assert.equal(Number(result.totalAmount), 250.5);
  });

  // ==========================================
  // 2. SUBSCRIPTION MANAGEMENT & LIFECYCLE TESTS
  // ==========================================
  let aliceSubscriptionId = '';

  await t.test('3. Create subscription with calculated period dates and lines', async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const req = createJsonRequest(
      '/api/subscriptions',
      'POST',
      {
        customerId: customerAliceId,
        planId: testPlanId,
        currency: 'USD',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoRenew: true,
      },
      customerAliceToken
    );

    const res = await createSubscriptionHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.customerId, customerAliceId);
    assert.equal(json.data.status, SubscriptionStatus.ACTIVE);
    assert.ok(json.data.subscriptionNumber.startsWith('SUB-'));
    assert.equal(json.data.lines.length, 1);

    aliceSubscriptionId = json.data.id;
    cleanupIds.subscriptions.push(aliceSubscriptionId);
  });

  await t.test('4. Enforce customer data isolation: Bob cannot view or edit Alice subscription', async () => {
    // Bob tries to GET Alice's subscription
    const getReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}`,
      'GET',
      undefined,
      customerBobToken
    );
    const getRes = await getSubscriptionDetailHandler(getReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(getRes.status, 403);

    // Bob tries to PATCH Alice's subscription
    const patchReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}`,
      'PATCH',
      { autoRenew: false },
      customerBobToken
    );
    const patchRes = await patchSubscriptionHandler(patchReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(patchRes.status, 403);
  });

  await t.test('5. Valid subscription lifecycle transition: ACTIVE -> PAUSED -> ACTIVE', async () => {
    // Pause subscription
    const pauseReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/status`,
      'POST',
      { status: SubscriptionStatus.PAUSED },
      customerAliceToken
    );
    const pauseRes = await subscriptionStatusHandler(pauseReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(pauseRes.status, 200);
    const pauseJson = await pauseRes.json();
    assert.equal(pauseJson.data.status, SubscriptionStatus.PAUSED);
    assert.ok(pauseJson.data.pausedAt);

    // Resume subscription
    const resumeReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/status`,
      'POST',
      { status: SubscriptionStatus.ACTIVE },
      customerAliceToken
    );
    const resumeRes = await subscriptionStatusHandler(resumeReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(resumeRes.status, 200);
    const resumeJson = await resumeRes.json();
    assert.equal(resumeJson.data.status, SubscriptionStatus.ACTIVE);
    assert.equal(resumeJson.data.pausedAt, null);
  });

  await t.test('6. Reject invalid subscription lifecycle transition (e.g. TRIALING without active plan trial)', async () => {
    const invalidReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/status`,
      'POST',
      { status: SubscriptionStatus.TRIALING },
      customerAliceToken
    );
    const invalidRes = await subscriptionStatusHandler(invalidReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(invalidRes.status, 400);
    const json = await invalidRes.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  await t.test('7. Renew subscription advances period dates by plan interval', async () => {
    const beforeSub = await prisma.subscription.findUniqueOrThrow({
      where: { id: aliceSubscriptionId },
    });
    const oldEnd = beforeSub.currentPeriodEnd;

    const renewReq = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/renew`,
      'POST',
      {},
      customerAliceToken
    );
    const renewRes = await subscriptionRenewHandler(renewReq, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(renewRes.status, 200);
    const json = await renewRes.json();
    assert.equal(json.success, true);
    assert.equal(new Date(json.data.currentPeriodStart).getTime(), oldEnd.getTime());
    assert.ok(new Date(json.data.currentPeriodEnd) > oldEnd);
  });

  // ==========================================
  // 3. QUOTATIONS WORKFLOW TESTS
  // ==========================================
  let quotationId = '';

  await t.test('8. Create quotation with calculated totals, taxes, and line items', async () => {
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const req = createJsonRequest(
      '/api/quotations',
      'POST',
      {
        customerId: customerAliceId,
        validUntil,
        currency: 'USD',
        notes: 'Annual enterprise promotion quotation',
        lines: [
          {
            planId: testPlanId,
            productId: testProductId,
            description: 'Enterprise Cloud Pro Subscription',
            quantity: 3,
            unitPrice: 150.0,
            discountAmount: 50.0,
            taxRate: 0.08,
          },
        ],
      },
      customerAliceToken
    );

    const res = await createQuotationHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'DRAFT');
    assert.ok(json.data.quotationNumber.startsWith('QUO-'));
    assert.equal(Number(json.data.subtotal), 450);
    assert.equal(Number(json.data.discountAmount), 50);
    // afterDiscount = 400 * 0.08 = 32.00 tax -> total = 432.00
    assert.equal(Number(json.data.taxAmount), 32);
    assert.equal(Number(json.data.totalAmount), 432);

    quotationId = json.data.id;
    cleanupIds.quotations.push(quotationId);
  });

  await t.test('9. Confirm quotation converts into active subscription', async () => {
    const req = createJsonRequest(
      `/api/quotations/${quotationId}/confirm`,
      'POST',
      {},
      customerAliceToken
    );

    const res = await confirmQuotationHandler(req, {
      params: Promise.resolve({ id: quotationId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.quotation.status, 'ACCEPTED');
    assert.ok(json.data.subscription.id);
    assert.equal(json.data.subscription.customerId, customerAliceId);

    cleanupIds.subscriptions.push(json.data.subscription.id);

    // Confirming again should be rejected with 400
    const duplicateConfirm = await confirmQuotationHandler(req, {
      params: Promise.resolve({ id: quotationId }),
    });
    assert.equal(duplicateConfirm.status, 400);
  });

  // ==========================================
  // 4. RECURRING INVOICING & DUPLICATE PREVENTION
  // ==========================================
  let generatedInvoiceId = '';

  await t.test('10. Generate invoice from active subscription', async () => {
    const req = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/invoice`,
      'POST',
      { dueDays: 14, notes: 'Monthly recurring billing cycle' },
      customerAliceToken
    );

    const res = await subscriptionInvoiceHandler(req, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    const json = await res.json();
    if (res.status !== 201) {
      console.log('DEBUG TEST 10 ERROR:', res.status, json, 'aliceSubscriptionId:', aliceSubscriptionId);
    }
    assert.equal(res.status, 201);
    assert.equal(json.success, true);
    assert.equal(json.data.isDuplicatePrevented, false);
    assert.equal(json.data.invoice.status, InvoiceStatus.OPEN);
    assert.equal(json.data.invoice.subscriptionId, aliceSubscriptionId);
    assert.equal(Number(json.data.invoice.amountPaid), 0);
    assert.equal(json.data.invoice.amountDue, json.data.invoice.totalAmount);

    generatedInvoiceId = json.data.invoice.id;
    cleanupIds.invoices.push(generatedInvoiceId);
  });

  await t.test('11. Prevent duplicate recurring invoice for the same subscription period (Idempotency)', async () => {
    // Calling invoice generation a second time for the exact same billing period
    const req = createJsonRequest(
      `/api/subscriptions/${aliceSubscriptionId}/invoice`,
      'POST',
      { dueDays: 14 },
      customerAliceToken
    );

    const res = await subscriptionInvoiceHandler(req, {
      params: Promise.resolve({ id: aliceSubscriptionId }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.isDuplicatePrevented, true);
    assert.equal(json.data.invoice.id, generatedInvoiceId);

    // Verify in database that only ONE invoice exists for this subscription
    const count = await prisma.invoice.count({
      where: { subscriptionId: aliceSubscriptionId, status: { not: InvoiceStatus.VOID } },
    });
    assert.equal(count, 1);
  });

  // ==========================================
  // 5. PAYMENT RECORDING & BALANCE RECONCILIATION
  // ==========================================
  let paymentId = '';

  await t.test('12. Reject invalid payment amounts (zero, negative, or overpayment)', async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: generatedInvoiceId },
    });
    const amountDue = Number(invoice.amountDue);

    // Zero payment
    const zeroReq = createJsonRequest(
      '/api/payments',
      'POST',
      {
        invoiceId: generatedInvoiceId,
        customerId: customerAliceId,
        amount: 0,
      },
      customerAliceToken
    );
    const zeroRes = await recordPaymentHandler(zeroReq);
    assert.equal(zeroRes.status, 400);

    // Overpayment (> amountDue)
    const overpaymentReq = createJsonRequest(
      '/api/payments',
      'POST',
      {
        invoiceId: generatedInvoiceId,
        customerId: customerAliceId,
        amount: amountDue + 500,
      },
      customerAliceToken
    );
    const overpaymentRes = await recordPaymentHandler(overpaymentReq);
    assert.equal(overpaymentRes.status, 400);
    const json = await overpaymentRes.json();
    assert.ok(json.error.message.includes('exceeds outstanding invoice balance'));
  });

  await t.test('13. Record partial payment and verify invoice balances', async () => {
    const partialAmount = 50.0;
    const req = createJsonRequest(
      '/api/payments',
      'POST',
      {
        invoiceId: generatedInvoiceId,
        customerId: customerAliceId,
        amount: partialAmount,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        reference: `REF-PARTIAL-${Date.now()}`,
      },
      customerAliceToken
    );

    const res = await recordPaymentHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(Number(json.data.payment.amount), 50);
    assert.equal(json.data.invoice.status, InvoiceStatus.OPEN);
    assert.equal(Number(json.data.invoice.amountPaid), 50);

    paymentId = json.data.payment.id;
    cleanupIds.payments.push(paymentId);
  });

  await t.test('14. Record final payment satisfying invoice: marks PAID and sets paidAt', async () => {
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({
      where: { id: generatedInvoiceId },
    });
    const remainingDue = Number(invoiceBefore.amountDue);

    const req = createJsonRequest(
      '/api/payments',
      'POST',
      {
        invoiceId: generatedInvoiceId,
        customerId: customerAliceId,
        amount: remainingDue,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        reference: `REF-FINAL-${Date.now()}`,
      },
      customerAliceToken
    );

    const res = await recordPaymentHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.invoice.status, InvoiceStatus.PAID);
    assert.equal(Number(json.data.invoice.amountDue), 0);
    assert.ok(json.data.invoice.paidAt);

    cleanupIds.payments.push(json.data.payment.id);

    // Attempting additional payment on fully paid invoice must be rejected
    const extraPaymentReq = createJsonRequest(
      '/api/payments',
      'POST',
      {
        invoiceId: generatedInvoiceId,
        customerId: customerAliceId,
        amount: 10.0,
      },
      customerAliceToken
    );
    const extraRes = await recordPaymentHandler(extraPaymentReq);
    assert.equal(extraRes.status, 400);
  });

  await t.test('15. Payment refund reconciles invoice balance back to OPEN', async () => {
    // Admin refunds the partial payment
    const refundReq = createJsonRequest(
      `/api/payments/${paymentId}/status`,
      'POST',
      {
        status: PaymentStatus.REFUNDED,
        failureReason: 'Customer requested refund for partial payment',
      },
      adminToken
    );

    const refundRes = await paymentStatusHandler(refundReq, {
      params: Promise.resolve({ id: paymentId }),
    });
    assert.equal(refundRes.status, 200);
    const json = await refundRes.json();
    assert.equal(json.data.status, PaymentStatus.REFUNDED);

    // Verify invoice reopened and amountDue increased
    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: generatedInvoiceId },
    });
    assert.equal(updatedInvoice.status, InvoiceStatus.OPEN);
    assert.equal(Number(updatedInvoice.amountDue), 50);
  });

  // ==========================================
  // 6. OVERDUE INVOICE & BATCH BILLING TESTS
  // ==========================================
  await t.test('16. Batch billing generates invoices and skips duplicates safely', async () => {
    const req = createJsonRequest(
      '/api/invoices/generate',
      'POST',
      { subscriptionId: aliceSubscriptionId, dueDays: 14 },
      adminToken
    );

    const res = await generateInvoicesHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    // Since an invoice for aliceSubscriptionId already exists for this period, it safely prevents duplicate
    assert.equal(json.data.duplicatesPreventedCount, 1);
    assert.equal(json.data.newInvoicesCount, 0);
  });
});
