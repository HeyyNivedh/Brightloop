import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export interface AuditLogOptions {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
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
        oldValues: options.oldValues !== undefined ? options.oldValues : Prisma.JsonNull,
        newValues: options.newValues !== undefined ? options.newValues : Prisma.JsonNull,
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
