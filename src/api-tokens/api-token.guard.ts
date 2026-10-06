import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { RequestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  displayPrefix,
  hashApiToken,
  isWellFormedToken,
} from './api-token.util.js';

const LAST_USED_RESOLUTION_MS = 60_000;

/** Authenticates `Authorization: Bearer phr_…` for the read-only public API. */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException(
        'Missing API token. Send "Authorization: Bearer <token>".',
      );
    }
    if (!isWellFormedToken(token)) {
      await this.reject('malformed');
      throw new UnauthorizedException('Invalid API token');
    }

    const apiToken = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
    });
    if (!apiToken || apiToken.revokedAt) {
      await this.reject(apiToken ? 'revoked' : 'unknown', displayPrefix(token));
      throw new UnauthorizedException(
        apiToken ? 'API token has been revoked' : 'Invalid API token',
      );
    }

    req.apiToken = apiToken;
    RequestContext.setActor({
      type: 'API_TOKEN',
      id: apiToken.id,
      label: apiToken.name,
    });

    const now = Date.now();
    if (
      !apiToken.lastUsedAt ||
      now - apiToken.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    ) {
      await this.prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return true;
  }

  private reject(reason: string, prefix?: string) {
    return this.audit.record({
      action: 'token.rejected',
      actor: { type: 'API_TOKEN', label: prefix ?? 'unknown' },
      detail: { reason, prefix },
    });
  }
}
