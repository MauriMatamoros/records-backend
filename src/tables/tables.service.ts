import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { paginationMeta } from '../common/dto/pagination.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ColumnsService } from './columns.service.js';
import {
  CreateTableDto,
  ListTablesQueryDto,
  PaginatedTablesDto,
  TableDto,
  UpdateTableDto,
} from './dto/table.dto.js';
import { toTableDto } from './mappers.js';
import { toSlug, uniquify } from './slugify.js';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly columns: ColumnsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListTablesQueryDto): Promise<PaginatedTablesDto> {
    const where: Prisma.TableWhereInput = query.q
      ? {
          OR: [
            { name: { contains: query.q } },
            { slug: { contains: query.q } },
            { description: { contains: query.q } },
          ],
        }
      : {};
    const [tables, total] = await this.prisma.$transaction([
      this.prisma.table.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { columns: true, rows: true } } },
      }),
      this.prisma.table.count({ where }),
    ]);
    return {
      items: tables.map(({ _count, ...t }) => ({
        ...t,
        columnCount: _count.columns,
        rowCount: _count.rows,
      })),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }

  async get(id: string): Promise<TableDto> {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: { columns: true },
    });
    if (!table) throw new NotFoundException('Table not found');
    return toTableDto(table);
  }

  async getBySlug(slug: string): Promise<TableDto> {
    const table = await this.prisma.table.findUnique({
      where: { slug },
      include: { columns: true },
    });
    if (!table) throw new NotFoundException(`Table "${slug}" not found`);
    return toTableDto(table);
  }

  async create(dto: CreateTableDto): Promise<TableDto> {
    if ((dto.columns ?? []).filter((c) => c.primary).length > 1) {
      throw new BadRequestException('A table can have only one primary key');
    }
    const slug = await this.resolveSlug(dto.slug, dto.name);
    const table = await this.prisma.$transaction(async (tx) => {
      const created = await tx.table.create({
        data: { name: dto.name, slug, description: dto.description },
      });
      for (const [order, column] of (dto.columns ?? []).entries()) {
        await this.columns.createInTx(tx, created.id, column, order);
      }
      return tx.table.findUniqueOrThrow({
        where: { id: created.id },
        include: { columns: true },
      });
    });
    await this.audit.record({
      action: 'table.create',
      entity: 'table',
      entityId: table.id,
      detail: {
        name: table.name,
        slug: table.slug,
        columns: table.columns.map((c) => c.key),
      },
    });
    return toTableDto(table);
  }

  async update(id: string, dto: UpdateTableDto): Promise<TableDto> {
    const before = await this.get(id);
    if (dto.slug && dto.slug !== before.slug) {
      await this.resolveSlug(dto.slug, before.name);
    }
    const table = await this.prisma.table.update({
      where: { id },
      data: { name: dto.name, slug: dto.slug, description: dto.description },
      include: { columns: true },
    });
    await this.audit.record({
      action: 'table.update',
      entity: 'table',
      entityId: id,
      detail: { changes: diff(before, dto) },
    });
    return toTableDto(table);
  }

  async remove(id: string): Promise<void> {
    const table = await this.get(id);
    const rowCount = await this.prisma.row.count({ where: { tableId: id } });
    await this.prisma.table.delete({ where: { id } });
    await this.audit.record({
      action: 'table.delete',
      entity: 'table',
      entityId: id,
      detail: { name: table.name, slug: table.slug, rowCount },
    });
  }

  private async resolveSlug(requested: string | undefined, name: string) {
    const taken = async (slug: string) =>
      !!(await this.prisma.table.findUnique({ where: { slug } }));
    if (requested) {
      if (await taken(requested)) {
        throw new ConflictException(`Slug "${requested}" is already in use`);
      }
      return requested;
    }
    return uniquify(toSlug(name), '-', taken);
  }
}

function diff(before: object, changes: object) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(changes)) {
    const from = (before as Record<string, unknown>)[key];
    if (to !== undefined && to !== from) out[key] = { from, to };
  }
  return out;
}
