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
  metadata: z.record(z.string(), z.any()).optional(),
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
  metadata: z.record(z.string(), z.any()).optional(),
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
