import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from './errors';
import { ApiErrorResponse, ApiSuccessResponse } from '@/types/api';

export function apiSuccess<T>(data: T, status = 200, meta?: ApiSuccessResponse<T>['meta']): NextResponse {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };
  return NextResponse.json(body, { status });
}

export function apiError(message: string, status = 500, code = 'INTERNAL_SERVER_ERROR', details?: unknown): NextResponse {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}

export function handleApiError(error: unknown): NextResponse {
  // Rethrow Next.js internal navigation/prerender bailouts
  if (error && typeof error === 'object' && 'digest' in error && String((error as { digest?: unknown }).digest).startsWith('NEXT_')) {
    throw error;
  }
  if (error instanceof AppError) {
    return apiError(error.message, error.statusCode, error.code, error.details);
  }

  // Zod schema validation errors
  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map((issue) => ({
      field: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path),
      message: issue.message,
    }));
    return apiError('Validation failed for one or more fields', 400, 'VALIDATION_ERROR', formattedErrors);
  }

  // Prisma database errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation (P2002)
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || [];
      const field = target.length > 0 ? target.join(', ') : 'field';
      return apiError(`A record with this ${field} already exists.`, 409, 'DUPLICATE_RECORD', { fields: target });
    }

    // Record to update/delete not found (P2025)
    if (error.code === 'P2025') {
      return apiError('The requested record was not found or was already removed.', 404, 'RECORD_NOT_FOUND');
    }

    // Foreign key constraint failure (P2003)
    if (error.code === 'P2003') {
      return apiError('Cannot perform operation due to related records constraint.', 400, 'FOREIGN_KEY_VIOLATION', {
        field: error.meta?.field_name,
      });
    }
  }

  // Generic unhandled exceptions
  console.error('[API Unhandled Error]:', error);
  const message = process.env.NODE_ENV === 'production' ? 'An unexpected internal error occurred.' : (error as Error)?.message || 'Internal error';
  return apiError(message, 500, 'INTERNAL_SERVER_ERROR');
}
