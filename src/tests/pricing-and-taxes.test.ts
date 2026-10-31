import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Prisma, UserRole, DiscountType } from '@prisma/client';
import { prisma } from '../lib/db';
import { signSessionToken } from '../lib/auth/tokens';
import { computeTaxFromRules } from '../lib/pricing/tax-calculator';
import { checkDiscountEligibility, consumeDiscount } from '../lib/pricing/discount-calculator';
import { POST as createTaxHandler } from '../app/api/reference/tax-rules/route';
import { POST as createDiscountHandler } from '../app/api/reference/discount-rules/route';

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

test('Taxes, Discounts, and Financial Calculation Interfaces', async (t) => {
  let adminToken: string;
  let staffToken: string;
  let createdTaxId: string;
  let createdDiscountId: string;
  const uniqueCode = `PROMO${Date.now()}`;

  t.before(async () => {
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@brightloop.com' } });
    const staffUser = await prisma.user.findUnique({ where: { email: 'staff@brightloop.com' } });

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
  });

  t.after(async () => {
    if (createdTaxId) {
      await prisma.taxRule.deleteMany({ where: { id: createdTaxId } });
    }
    if (createdDiscountId) {
      await prisma.discountRule.deleteMany({ where: { id: createdDiscountId } });
    }
    await prisma.discountRule.deleteMany({ where: { code: uniqueCode } });
  });

  await t.test('1. Admin creates tax rule with valid percentage rate (0.0825 for 8.25%)', async () => {
    const req = createRequest('/api/reference/tax-rules', 'POST', {
      name: 'California District Tax',
      country: 'US',
      state: 'CA',
      rate: 0.0825,
      isCompound: false,
      priority: 1,
      active: true,
    }, adminToken);

    const res = await createTaxHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.name, 'California District Tax');
    createdTaxId = json.data.id;
  });

  await t.test('2. Rejects tax rule with invalid rate (> 1.0 or negative)', async () => {
    const req = createRequest('/api/reference/tax-rules', 'POST', {
      name: 'Invalid Tax',
      country: 'US',
      rate: 1.5, // 150% is invalid
    }, adminToken);

    const res = await createTaxHandler(req);
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  await t.test('3. Staff is forbidden from creating or updating tax rules', async () => {
    const req = createRequest('/api/reference/tax-rules', 'POST', {
      name: 'Staff Unauthorized Tax',
      country: 'US',
      rate: 0.05,
    }, staffToken);

    const res = await createTaxHandler(req);
    assert.equal(res.status, 403);
  });

  await t.test('4. Tax calculation engine: single tax rule calculation', () => {
    const rules = [
      {
        id: 'tax-1',
        name: 'Standard VAT',
        country: 'GB',
        state: null,
        postalCode: null,
        rate: new Prisma.Decimal('0.2000'), // 20%
        isCompound: false,
        priority: 0,
        active: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // $100 taxable amount with 20% VAT = $20 tax, $120 total
    const result = computeTaxFromRules(100.00, rules, false);
    assert.equal(result.taxableAmount, 100.00);
    assert.equal(result.taxAmount, 20.00);
    assert.equal(result.totalAmount, 120.00);
    assert.equal(result.appliedTaxes.length, 1);
    assert.equal(result.appliedTaxes[0].ratePercentage, 20.00);
  });

  await t.test('5. Tax calculation engine: compounding tax calculation across priorities', () => {
    const rules = [
      {
        id: 'tax-base',
        name: 'State Base Tax (10%)',
        country: 'US',
        state: 'QC',
        postalCode: null,
        rate: new Prisma.Decimal('0.1000'), // 10%
        isCompound: false,
        priority: 1,
        active: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'tax-compound',
        name: 'Compounding Surtax (5%)',
        country: 'US',
        state: 'QC',
        postalCode: null,
        rate: new Prisma.Decimal('0.0500'), // 5% compound
        isCompound: true,
        priority: 2,
        active: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Base: $200.00
    // Tax 1 (10% non-compound): $20.00 -> total tax so far = $20.00
    // Tax 2 (5% compound on 200 + 20 = 220): $11.00
    // Total Tax: $31.00; Total Amount: $231.00
    const result = computeTaxFromRules(200.00, rules, false);
    assert.equal(result.taxableAmount, 200.00);
    assert.equal(result.taxAmount, 31.00);
    assert.equal(result.totalAmount, 231.00);
  });

  await t.test('6. Tax exemption: returns 0 tax when customer is tax-exempt', () => {
    const rules = [
      {
        id: 'tax-1',
        name: 'Standard VAT',
        country: 'GB',
        state: null,
        postalCode: null,
        rate: new Prisma.Decimal('0.2000'),
        isCompound: false,
        priority: 0,
        active: true,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = computeTaxFromRules(500.00, rules, true);
    assert.equal(result.taxableAmount, 500.00);
    assert.equal(result.taxAmount, 0.00);
    assert.equal(result.totalAmount, 500.00);
    assert.equal(result.isTaxExempt, true);
    assert.equal(result.appliedTaxes.length, 0);
  });

  await t.test('7. Admin creates percentage discount with maximum cap and usage limit', async () => {
    const req = createRequest('/api/reference/discount-rules', 'POST', {
      code: uniqueCode,
      name: 'Spring Promotional Special',
      type: 'PERCENTAGE',
      value: 20.00, // 20%
      minOrderAmount: 100.00,
      maxDiscountAmount: 50.00, // max $50 cap
      usageLimit: 5,
      active: true,
    }, adminToken);

    const res = await createDiscountHandler(req);
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.data.code, uniqueCode);
    createdDiscountId = json.data.id;
  });

  await t.test('8. Discount evaluation: calculates percentage and enforces maximum cap', () => {
    const rule = {
      id: 'd1',
      code: 'CAPTEST',
      name: 'Cap Test 20%',
      type: DiscountType.PERCENTAGE,
      value: new Prisma.Decimal('20.00'),
      minOrderAmount: new Prisma.Decimal('100.00'),
      maxDiscountAmount: new Prisma.Decimal('50.00'),
      startsAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 36000000),
      usageLimit: 10,
      usageCount: 0,
      active: true,
      applicablePlanIds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Case A: $200 order. 20% is $40.00 (under $50 cap) => discount $40, final $160
    const evalA = checkDiscountEligibility(rule, 200.00);
    assert.equal(evalA.eligible, true);
    assert.equal(evalA.discountAmount, 40.00);
    assert.equal(evalA.finalAmount, 160.00);

    // Case B: $500 order. 20% is $100.00 (exceeds $50 cap) => capped at $50, final $450
    const evalB = checkDiscountEligibility(rule, 500.00);
    assert.equal(evalB.eligible, true);
    assert.equal(evalB.discountAmount, 50.00);
    assert.equal(evalB.finalAmount, 450.00);
  });

  await t.test('9. Discount evaluation: rejects when minimum order amount is unmet', () => {
    const rule = {
      id: 'd2',
      code: 'MINTEST',
      name: 'Min Test',
      type: DiscountType.FIXED_AMOUNT,
      value: new Prisma.Decimal('25.00'),
      minOrderAmount: new Prisma.Decimal('150.00'),
      maxDiscountAmount: null,
      startsAt: new Date(Date.now() - 3600000),
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
      active: true,
      applicablePlanIds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // $100 order < $150 minimum => INELIGIBLE
    const result = checkDiscountEligibility(rule, 100.00);
    assert.equal(result.eligible, false);
    assert.equal(result.discountAmount, 0);
    assert.equal(result.finalAmount, 100.00);
    assert.match(result.reason || '', /Minimum order amount/);
  });

  await t.test('10. Discount evaluation: rejects expired discounts (endsAt in the past)', () => {
    const expiredRule = {
      id: 'd3',
      code: 'EXPIRED',
      name: 'Expired 2024 Promo',
      type: DiscountType.PERCENTAGE,
      value: new Prisma.Decimal('10.00'),
      minOrderAmount: null,
      maxDiscountAmount: null,
      startsAt: new Date('2024-01-01'),
      endsAt: new Date('2024-06-01'),
      usageLimit: null,
      usageCount: 0,
      active: true,
      applicablePlanIds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = checkDiscountEligibility(expiredRule, 100.00);
    assert.equal(result.eligible, false);
    assert.equal(result.discountAmount, 0);
    assert.match(result.reason || '', /expired/i);
  });

  await t.test('11. Discount evaluation: rejects discounts that have reached their usage limit', () => {
    const exhaustedRule = {
      id: 'd4',
      code: 'MAXED',
      name: 'Exhausted Promo',
      type: DiscountType.PERCENTAGE,
      value: new Prisma.Decimal('15.00'),
      minOrderAmount: null,
      maxDiscountAmount: null,
      startsAt: new Date(Date.now() - 3600000),
      endsAt: null,
      usageLimit: 3,
      usageCount: 3, // Already reached limit
      active: true,
      applicablePlanIds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = checkDiscountEligibility(exhaustedRule, 100.00);
    assert.equal(result.eligible, false);
    assert.equal(result.discountAmount, 0);
    assert.match(result.reason || '', /maximum usage limit/i);
  });

  await t.test('12. Discount evaluation: non-negative guarantee (discount cannot exceed order total)', () => {
    const massiveDiscount = {
      id: 'd5',
      code: 'HUGE100',
      name: 'Massive $100 Off',
      type: DiscountType.FIXED_AMOUNT,
      value: new Prisma.Decimal('100.00'),
      minOrderAmount: null,
      maxDiscountAmount: null,
      startsAt: new Date(Date.now() - 3600000),
      endsAt: null,
      usageLimit: null,
      usageCount: 0,
      active: true,
      applicablePlanIds: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // $40 order with $100 discount => capped at $40, final is $0.00, NEVER negative
    const result = checkDiscountEligibility(massiveDiscount, 40.00);
    assert.equal(result.eligible, true);
    assert.equal(result.discountAmount, 40.00);
    assert.equal(result.finalAmount, 0.00);
  });

  await t.test('13. Discount consumption atomically increments usage count', async () => {
    const before = await prisma.discountRule.findUnique({ where: { id: createdDiscountId } });
    const initialCount = before?.usageCount || 0;

    const consumed = await consumeDiscount(uniqueCode);
    assert.equal(consumed.success, true);
    assert.equal(consumed.discountRule?.usageCount, initialCount + 1);
  });
});
