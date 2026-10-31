import test from 'node:test';
import assert from 'node:assert/strict';
import {
  passwordSchema,
  emailSchema,
  registerSchema,
  createCustomerSchema,
  createTaxRuleSchema,
  createDiscountRuleSchema,
} from '../lib/validation/schemas';
import { validatePasswordRequirements } from '../lib/auth/password';
import { getPaginationParams } from '../lib/api/pagination';

test('Password Validation Rules', async (t) => {
  await t.test('rejects passwords with 8 characters or fewer', () => {
    // 8 chars with uppercase, lowercase, special char
    const check = validatePasswordRequirements('Abc!1234');
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('more than 8 characters')));
  });

  await t.test('rejects passwords lacking uppercase letter', () => {
    const check = validatePasswordRequirements('abcdefg!123');
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('uppercase')));
  });

  await t.test('rejects passwords lacking lowercase letter', () => {
    const check = validatePasswordRequirements('ABCDEFG!123');
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('lowercase')));
  });

  await t.test('rejects passwords lacking special character', () => {
    const check = validatePasswordRequirements('Abcdefg12345');
    assert.equal(check.valid, false);
    assert.ok(check.errors.some((e) => e.includes('special character')));
  });

  await t.test('accepts valid password meeting all 4 criteria', () => {
    const check = validatePasswordRequirements('SecurePass123!@#');
    assert.equal(check.valid, true);
    assert.equal(check.errors.length, 0);

    const zodResult = passwordSchema.safeParse('SecurePass123!@#');
    assert.equal(zodResult.success, true);
  });
});

test('Email Normalization', async (t) => {
  await t.test('trims and lowercases email address', () => {
    const parsed = emailSchema.parse('   Alice.Smith@BrightLoop.COM  ');
    assert.equal(parsed, 'alice.smith@brightloop.com');
  });

  await t.test('rejects invalid email formats', () => {
    const result = emailSchema.safeParse('not-an-email');
    assert.equal(result.success, false);
  });
});

test('Customer Schema Validation', async (t) => {
  await t.test('validates valid customer input with default currency', () => {
    const result = createCustomerSchema.safeParse({
      contactName: 'Jane Doe',
      email: 'Jane.Doe@example.com',
      companyName: 'Acme Corp',
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.email, 'jane.doe@example.com');
      assert.equal(result.data.currency, 'USD');
      assert.equal(result.data.taxExempt, false);
    }
  });

  await t.test('requires minimum contact name length', () => {
    const result = createCustomerSchema.safeParse({
      contactName: 'J',
      email: 'valid@example.com',
    });
    assert.equal(result.success, false);
  });
});

test('Pagination and Query Params Parsing', async (t) => {
  await t.test('provides safe defaults when params are missing or invalid', () => {
    const params = getPaginationParams(new URL('http://localhost:3000/api/customers'));
    assert.equal(params.page, 1);
    assert.equal(params.limit, 20);
    assert.equal(params.skip, 0);
    assert.equal(params.sortOrder, 'desc');
  });

  await t.test('parses custom page, limit, and sortOrder', () => {
    const params = getPaginationParams(
      new URL('http://localhost:3000/api/customers?page=3&limit=25&sortBy=name&sortOrder=asc&search=acme')
    );
    assert.equal(params.page, 3);
    assert.equal(params.limit, 25);
    assert.equal(params.skip, 50); // (3 - 1) * 25
    assert.equal(params.sortBy, 'name');
    assert.equal(params.sortOrder, 'asc');
    assert.equal(params.search, 'acme');
  });

  await t.test('clamps limit to maximum of 100 to prevent DoS', () => {
    const params = getPaginationParams(new URL('http://localhost:3000/api/customers?limit=9999'));
    assert.equal(params.limit, 100);
  });
});
