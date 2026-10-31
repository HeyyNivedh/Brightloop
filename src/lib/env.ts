import { z } from 'zod';

const envSchema = z.object({
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

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables configuration:');
    console.error(result.error.format());
    // In test or local dev environment, provide safe fallback
    if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) {
      return {
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54333/brightloop?schema=public',
        DB_PORT: '54333',
        JWT_SECRET: process.env.JWT_SECRET || 'brightloop-super-secret-jwt-key-for-development-change-in-prod-min-32-chars',
        JWT_EXPIRES_IN: '7d',
        PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: 60,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NODE_ENV: (process.env.NODE_ENV as any) || 'development',
        EMAIL_ADAPTER: 'development',
        SMTP_FROM: 'noreply@brightloop.local',
      };
    }
    throw new Error('Invalid environment variables configuration');
  }
  return result.data;
}

export const env = loadEnv();
