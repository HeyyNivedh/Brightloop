import { z } from 'zod';

/**
 * Strict password validation policy:
 * - Length strictly greater than 8 characters (>= 9 chars)
 * - At least one uppercase letter [A-Z]
 * - At least one lowercase letter [a-z]
 * - At least one special character [!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]
 */
export const passwordSchema = z
  .string()
  .min(9, 'Password must be more than 8 characters long (minimum 9 characters)')
  .refine((val) => /[A-Z]/.test(val), 'Password must contain at least one uppercase letter')
  .refine((val) => /[a-z]/.test(val), 'Password must contain at least one lowercase letter')
  .refine(
    (val) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(val),
    'Password must contain at least one special character (!@#$%^&*...)'
  );

/**
 * Email validation and automatic normalization (trim and lowercase)
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address format');

// ==========================================
// AUTHENTICATION SCHEMAS
// ==========================================

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  companyName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// ==========================================
// USER SCHEMAS
// ==========================================

export const createStaffUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  password: passwordSchema,
  role: z.enum(['STAFF', 'ADMIN']).default('STAFF'),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  role: z.enum(['ADMIN', 'STAFF', 'CUSTOMER']).optional(),
});

// ==========================================
// CUSTOMER SCHEMAS
// ==========================================

const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().min(2, '2-letter country code is required').optional(),
});

export const createCustomerSchema = z.object({
  contactName: z.string().trim().min(2, 'Contact name is required'),
  email: emailSchema,
  companyName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code (e.g. USD)').default('USD'),
  taxExempt: z.boolean().default(false),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateCustomerSchema = z.object({
  contactName: z.string().trim().min(2).optional(),
  companyName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  currency: z.string().length(3).optional(),
  taxExempt: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ==========================================
// PRODUCTS & PRICING SCHEMAS
// ==========================================

export const createProductSchema = z.object({
  code: z.string().trim().min(2, 'Product code is required'),
  name: z.string().trim().min(2, 'Product name is required'),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  active: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createProductVariantSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  sku: z.string().trim().min(2, 'SKU is required'),
  name: z.string().trim().min(2, 'Variant name is required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().default(true),
});

export const createPlanPricingSchema = z.object({
  currency: z.string().length(3).default('USD'),
  amount: z.number().nonnegative('Amount must be zero or positive'),
  setupFee: z.number().nonnegative('Setup fee must be zero or positive').default(0),
  active: z.boolean().default(true),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional(),
});

export const createSubscriptionPlanSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().optional(),
  code: z.string().trim().min(2, 'Plan code is required'),
  name: z.string().trim().min(2, 'Plan name is required'),
  description: z.string().trim().optional(),
  trialPeriodDays: z.number().int().nonnegative().default(0),
  billingInterval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('MONTH'),
  intervalCount: z.number().int().positive().default(1),
  active: z.boolean().default(true),
  pricing: z.array(createPlanPricingSchema).min(1, 'At least one pricing tier is required').optional(),
});

// ==========================================
// QUOTATIONS SCHEMAS
// ==========================================

export const quotationLineItemSchema = z.object({
  productId: z.string().optional(),
  planId: z.string().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  discountAmount: z.number().nonnegative().default(0),
  taxRate: z.number().nonnegative().max(1).default(0),
});

export const createQuotationSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  templateId: z.string().optional(),
  validUntil: z.coerce.date(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  lines: z.array(quotationLineItemSchema).min(1, 'At least one quotation line item is required'),
});

export const updateQuotationStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
});

// ==========================================
// SUBSCRIPTIONS SCHEMAS
// ==========================================

export const subscriptionLineItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  discountAmount: z.number().nonnegative().default(0),
  taxRate: z.number().nonnegative().max(1).default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createSubscriptionSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  planId: z.string().min(1, 'Plan ID is required'),
  currency: z.string().length(3).default('USD'),
  currentPeriodStart: z.coerce.date().default(() => new Date()),
  currentPeriodEnd: z.coerce.date(),
  trialStart: z.coerce.date().optional(),
  trialEnd: z.coerce.date().optional(),
  autoRenew: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lines: z.array(subscriptionLineItemSchema).optional(),
});

export const updateSubscriptionStatusSchema = z.object({
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED']),
  cancelAtPeriodEnd: z.boolean().optional(),
});

// ==========================================
// INVOICES SCHEMAS
// ==========================================

export const invoiceLineItemSchema = z.object({
  subscriptionLineId: z.string().optional(),
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative('Unit price must be non-negative'),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

export const createInvoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  subscriptionId: z.string().optional(),
  issueDate: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date(),
  currency: z.string().length(3).default('USD'),
  notes: z.string().trim().optional(),
  lines: z.array(invoiceLineItemSchema).min(1, 'At least one invoice line item is required'),
});

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE']),
  paidAt: z.coerce.date().optional(),
});

// ==========================================
// PAYMENTS SCHEMAS
// ==========================================

export const createPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  amount: z.number().positive('Payment amount must be greater than zero'),
  currency: z.string().length(3).default('USD'),
  paymentMethod: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'STRIPE', 'MANUAL', 'OTHER']).default('CREDIT_CARD'),
  providerTransactionId: z.string().trim().optional(),
  reference: z.string().trim().optional(),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']),
  failureReason: z.string().optional(),
  paidAt: z.coerce.date().optional(),
});

// ==========================================
// REFERENCE DATA SCHEMAS
// ==========================================

export const createTaxRuleSchema = z.object({
  name: z.string().trim().min(2, 'Tax rule name is required'),
  country: z.string().length(2, '2-letter ISO country code'),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  rate: z.number().positive().max(1, 'Rate must be between 0 and 1 (e.g. 0.0825 for 8.25%)'),
  isCompound: z.boolean().default(false),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  description: z.string().optional(),
});

export const createDiscountRuleSchema = z.object({
  name: z.string().trim().min(2, 'Discount rule name is required'),
  code: z.string().trim().toUpperCase().min(3, 'Promo code must be at least 3 characters'),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).default('PERCENTAGE'),
  value: z.number().positive('Discount value must be greater than zero'),
  minOrderAmount: z.number().positive().optional(),
  maxDiscountAmount: z.number().positive().optional(),
  startsAt: z.coerce.date().default(() => new Date()),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().positive().optional(),
  applicablePlanIds: z.array(z.string()).optional(),
  active: z.boolean().default(true),
});

// Helper for validating incoming request JSON
export async function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): Promise<T> {
  return schema.parseAsync(data);
}
