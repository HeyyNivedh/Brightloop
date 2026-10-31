import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/db';
import { signSessionToken } from '../lib/auth/tokens';
import { POST as createProductHandler } from '../app/api/products/route';
import { PUT as updateProductHandler } from '../app/api/products/[id]/route';
import { POST as createVariantHandler } from '../app/api/products/[id]/variants/route';
import { POST as createPlanHandler } from '../app/api/plans/route';
import { calculateUnitPrice } from '../lib/pricing/variant-pricing';

function createRequest(url: string, method: string, body?: unknown, token?: string) {
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

test('Product & Variant Management and Pricing Calculations', async (t) => {
  let adminToken: string;
  let staffToken: string;
  let customerToken: string;
  const uniqueCode = `PROD-TEST-${Date.now()}`;
  let createdProductId: string;
  let createdVariantId: string;

  t.before(async () => {
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@brightloop.com' } });
    const staffUser = await prisma.user.findUnique({ where: { email: 'staff@brightloop.com' } });
    const custUser = await prisma.user.findUnique({ where: { email: 'customer@acme.com' } });

    adminToken = await signSessionToken({
      userId: adminUser?.id || 'admin-user-id',
      email: 'admin@brightloop.com',
      role: UserRole.ADMIN,
      name: 'Administrator',
    });

    staffToken = await signSessionToken({
      userId: staffUser?.id || 'staff-user-id',
      email: 'staff@brightloop.com',
      role: UserRole.STAFF,
      name: 'Staff Member',
    });

    customerToken = await signSessionToken({
      userId: custUser?.id || 'cust-user-id',
      email: 'customer@acme.com',
      role: UserRole.CUSTOMER,
      name: 'Customer Acme',
      customerId: custUser?.id,
    });
  });

  t.after(async () => {
    if (createdProductId) {
      await prisma.planPricing.deleteMany({
        where: { plan: { productId: createdProductId } },
      });
      await prisma.subscriptionPlan.deleteMany({
        where: { productId: createdProductId },
      });
      await prisma.productVariant.deleteMany({
        where: { productId: createdProductId },
      });
      await prisma.product.deleteMany({
        where: { id: createdProductId },
      });
    }
  });

  await t.test('1. Admin creates product with valid code and attributes', async () => {
    const req = createRequest('/api/products', 'POST', {
      code: uniqueCode,
      name: 'Brightloop ERP Platform',
      description: 'Comprehensive business enterprise suite',
      category: 'SOFTWARE',
      active: true,
    }, adminToken);

    const res = await createProductHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.code, uniqueCode);
    assert.equal(json.data.name, 'Brightloop ERP Platform');
    createdProductId = json.data.id;
  });

  await t.test('2. Rejects product creation when required fields are missing', async () => {
    const req = createRequest('/api/products', 'POST', {
      code: '',
      name: '  ',
    }, adminToken);

    const res = await createProductHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  await t.test('3. Non-admin (STAFF & CUSTOMER) are forbidden from creating products', async () => {
    // Staff attempt
    const staffReq = createRequest('/api/products', 'POST', {
      code: `UNAUTH-STAFF-${Date.now()}`,
      name: 'Unauthorized Product',
    }, staffToken);
    const staffRes = await createProductHandler(staffReq);
    assert.equal(staffRes.status, 403);

    // Customer attempt
    const custReq = createRequest('/api/products', 'POST', {
      code: `UNAUTH-CUST-${Date.now()}`,
      name: 'Unauthorized Product',
    }, customerToken);
    const custRes = await createProductHandler(custReq);
    assert.equal(custRes.status, 403);
  });

  await t.test('4. Admin can update existing product', async () => {
    const req = createRequest(`/api/products/${createdProductId}`, 'PUT', {
      name: 'Brightloop ERP Platform (Updated)',
      description: 'Updated enterprise description',
    }, adminToken);

    const res = await updateProductHandler(req, { params: Promise.resolve({ id: createdProductId }) });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.name, 'Brightloop ERP Platform (Updated)');
    assert.equal(json.data.description, 'Updated enterprise description');
  });

  await t.test('5. Admin associates product variant with configurable additional price (e.g. Odoo +560)', async () => {
    const req = createRequest(`/api/products/${createdProductId}/variants`, 'POST', {
      sku: `SKU-ODOO-${Date.now()}`,
      name: 'Odoo Edition',
      attributes: {
        brand: 'Odoo',
        additionalPrice: 560.00,
      },
      active: true,
    }, adminToken);

    const res = await createVariantHandler(req, { params: Promise.resolve({ id: createdProductId }) });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.name, 'Odoo Edition');
    assert.equal(json.data.attributes.additionalPrice, 560.00);
    createdVariantId = json.data.id;
  });

  await t.test('6. Variant pricing calculation: Base Price + Applicable Variant Adjustments', () => {
    const baseProductPrice = 1200.00;
    const odooAttributes = { brand: 'Odoo', additionalPrice: 560.00 };

    // Calculation: 1200 + 560 = 1760.00
    const result = calculateUnitPrice(baseProductPrice, odooAttributes);
    assert.equal(result.basePrice, 1200.00);
    assert.equal(result.additionalPrice, 560.00);
    assert.equal(result.finalUnitPrice, 1760.00);

    // Negative additional price is clamped to zero
    const negativeTest = calculateUnitPrice(100.00, { additionalPrice: -50.00 });
    assert.equal(negativeTest.additionalPrice, 0);
    assert.equal(negativeTest.finalUnitPrice, 100.00);

    // Missing attributes returns base price unmodified
    const baseOnly = calculateUnitPrice(49.00, null);
    assert.equal(baseOnly.finalUnitPrice, 49.00);
  });

  await t.test('7. Admin creates subscription plans across Daily, Weekly, Monthly, and Yearly intervals', async () => {
    const intervals: Array<'DAY' | 'WEEK' | 'MONTH' | 'YEAR'> = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

    for (const interval of intervals) {
      const planCode = `PLAN-${interval}-${Date.now()}`;
      const req = createRequest('/api/plans', 'POST', {
        productId: createdProductId,
        variantId: createdVariantId,
        code: planCode,
        name: `ERP Plan (${interval})`,
        billingInterval: interval,
        intervalCount: 1,
        trialPeriodDays: interval === 'MONTH' ? 14 : 0,
        pricing: [
          {
            currency: 'USD',
            amount: interval === 'YEAR' ? 1490.00 : 149.00,
            setupFee: 0,
            active: true,
          },
        ],
      }, adminToken);

      const res = await createPlanHandler(req);
      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.billingInterval, interval);
      assert.equal(json.data.pricing.length, 1);
    }
  });

  await t.test('8. Rejects invalid subscription plan with negative price', async () => {
    const req = createRequest('/api/plans', 'POST', {
      productId: createdProductId,
      code: `PLAN-INVALID-${Date.now()}`,
      name: 'Invalid Price Plan',
      billingInterval: 'MONTH',
      pricing: [
        {
          currency: 'USD',
          amount: -100, // Invalid negative price
        },
      ],
    }, adminToken);

    const res = await createPlanHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });
});
