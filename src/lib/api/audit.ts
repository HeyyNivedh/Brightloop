import { prisma } from '../db';

export interface AuditLogOptions {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(options: AuditLogOptions) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: options.userId ?? null,
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        oldValues: options.oldValues ? (options.oldValues as any) : undefined,
        newValues: options.newValues ? (options.newValues as any) : undefined,
        ipAddress: options.ipAddress ?? null,
        userAgent: options.userAgent ?? null,
      },
    });
  } catch (err) {
    // Non-blocking error: audit log failure should not crash main transaction
    console.error('[AuditLog] Failed to create audit log entry:', err);
    return null;
  }
}
