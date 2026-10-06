import { Injectable, Logger } from '@nestjs/common';
import { parseJson } from '../common/json.js';
import { Actor, RequestContext } from '../common/request-context.js';
import { paginationMeta } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';
import { AuditAction } from './audit-actions.js';

export interface AuditEntry {
  action: AuditAction;
  entity?: string;
  entityId?: string;
  detail?: unknown;
  /** Overrides the actor from the request context (e.g. failed logins). */
  actor?: Actor;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists an audit entry and mirrors it to the structured log. Never throws:
   * an audit-write failure is logged but must not fail the user's request.
   */
  async record(entry: AuditEntry): Promise<void> {
    const ctx = RequestContext.current();
    const actor = entry.actor ?? ctx?.actor ?? { type: 'SYSTEM' as const };

    this.logger.log({
      msg: `audit: ${entry.action}`,
      audit: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        actor,
      },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          detail:
            entry.detail === undefined ? null : JSON.stringify(entry.detail),
          actorType: actor.type,
          actorId: actor.id,
          actorLabel: actor.label,
          ip: ctx?.ip,
          requestId: ctx?.requestId,
        },
      });
    } catch (err) {
      this.logger.error({ msg: 'Failed to write audit log', err, entry });
    }
  }

  async list(query: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action
        ? query.action.endsWith('.')
          ? { startsWith: query.action }
          : query.action
        : undefined,
      actorType: query.actorType,
      actorLabel: query.actor ? { contains: query.actor } : undefined,
      entityId: query.entityId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((log) => ({
        ...log,
        detail: parseJson<unknown>(log.detail, null),
      })),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }
}
