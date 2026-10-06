import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { paginationMeta } from '../common/dto/pagination.dto.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  displayPrefix,
  generateApiToken,
  hashApiToken,
} from './api-token.util.js';
import {
  ApiTokenDto,
  CreateApiTokenDto,
  CreatedApiTokenDto,
  ListApiTokensQueryDto,
  PaginatedApiTokensDto,
} from './dto/api-token.dto.js';

const select = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class ApiTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListApiTokensQueryDto): Promise<PaginatedApiTokensDto> {
    const where = query.includeRevoked ? {} : { revokedAt: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.apiToken.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.apiToken.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async create(dto: CreateApiTokenDto, user: User): Promise<CreatedApiTokenDto> {
    const token = generateApiToken();
    const created = await this.prisma.apiToken.create({
      data: {
        name: dto.name,
        prefix: displayPrefix(token),
        tokenHash: hashApiToken(token),
        createdById: user.id,
      },
      select,
    });
    await this.audit.record({
      action: 'token.create',
      entity: 'api_token',
      entityId: created.id,
      detail: { name: created.name, prefix: created.prefix },
    });
    return { ...created, token };
  }

  async revoke(id: string): Promise<ApiTokenDto> {
    const existing = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Token not found');
    if (existing.revokedAt) throw new ConflictException('Token already revoked');

    const token = await this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select,
    });
    await this.audit.record({
      action: 'token.revoke',
      entity: 'api_token',
      entityId: id,
      detail: { name: token.name, prefix: token.prefix },
    });
    return token;
  }
}
