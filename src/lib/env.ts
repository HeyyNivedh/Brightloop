import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_PORT: z.string().default('54333'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long for security'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: z.coerce.number().default(60),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  EMAIL_ADAPTER: z.enum(['development', 'smtp']).default('development'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@brightloop.local'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate an environment dictionary against envSchema.
 * Throws an explicit Error if any required variable is missing or invalid.
 */
export function validateEnv(input: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment variables configuration: ${errorDetails}`);
  }
  return result.data;
}

function loadEnv(): Env {
  // Ensure .env is loaded if running in Node.js environment and not yet loaded
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile();
    } catch {
      // Ignore if .env is missing or already loaded
    }
  }

  return validateEnv(process.env);
}

export const env = loadEnv();

/**
 * Get the validated JWT secret string.
 */
export function getJwtSecret(): string {
  return env.JWT_SECRET;
}

/**
 * Get the validated JWT secret encoded as Uint8Array for jose / jwtVerify.
 */
export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}
