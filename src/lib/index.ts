// Database & Environment
export { prisma, default as db } from './db';
export { env } from './env';

// API Infrastructure
export { apiSuccess, apiError, handleApiError } from './api/response';
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from './api/errors';
export { getPaginationParams, buildPaginationMeta } from './api/pagination';
export { withTransaction } from './api/transaction';
export { createAuditLog, type AuditLogOptions } from './api/audit';

// Authentication & Session
export {
  hashPassword,
  verifyPassword,
  validatePasswordRequirements,
} from './auth/password';
export {
  signSessionToken,
  verifySessionToken,
  generateSecureRandomToken,
  hashToken,
} from './auth/tokens';
export {
  requireAuth,
  requireRole,
  requireCustomerScope,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  AUTH_COOKIE_NAME,
} from './auth/session';
export {
  getEmailAdapter,
  devEmailStore,
  type EmailAdapter,
  type EmailMessage,
} from './auth/email-adapter';

// RBAC
export {
  hasPermission,
  hasMinimumRole,
  isOneOfRoles,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
} from './rbac/permissions';

// Validation Schemas
export * from './validation/schemas';
