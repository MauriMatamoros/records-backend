import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Column } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { countEmptyCells, findDuplicateValues } from './column-constraints.js';
import {
  CHOICE_TYPES,
  ColumnOptions,
  KEYABLE_TYPES,
} from './column-type.enum.js';
import {
  ColumnDto,
  CreateColumnDto,
  ReorderColumnsDto,
  UpdateColumnDto,
} from './dto/column.dto.js';
import { toColumnDto } from './mappers.js';
import { toColumnKey, uniquify } from './slugify.js';

export type PrismaTx = Parameters<
  Parameters<PrismaService['$transaction']>[0]
>[0];

interface Constraints {
  required: boolean;
  unique: boolean;
  primary: boolean;
}

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async add(tableId: string, dto: CreateColumnDto): Promise<ColumnDto> {
    await this.assertTable(tableId);
    const column = await this.prisma.$transaction(async (tx) => {
      const last = await tx.column.findFirst({
        where: { tableId },
        orderBy: { order: 'desc' },
      });
      return this.createInTx(tx, tableId, dto, (last?.order ?? -1) + 1);
    });
    await this.audit.record({
      action: 'column.create',
      entity: 'column',
      entityId: column.id,
      detail: {
        tableId,
        key: column.key,
        type: column.type,
        required: column.required,
        unique: column.unique,
        primary: column.primary,
      },
    });
    return toColumnDto(column);
  }

  /** Shared with TablesService so tables can be created with columns. */
  async createInTx(
    tx: PrismaTx,
    tableId: string,
    dto: CreateColumnDto,
    order: number,
  ): Promise<Column> {
    const options = normalizeOptions(dto.type, dto.options);
    const constraints = resolveConstraints(dto.type, {
      required: dto.required ?? false,
      unique: dto.unique ?? false,
      primary: dto.primary ?? false,
    });

    if (constraints.required) {
      const rowCount = await tx.row.count({ where: { tableId } });
      if (rowCount > 0) {
        throw new ConflictException(
          `The table already has ${rowCount} row(s), so a new column cannot start out required${constraints.primary ? ' or as the primary key' : ''}. Add it as optional, fill in the values, then update it.`,
        );
      }
    }

    const taken = async (key: string) =>
      !!(await tx.column.findUnique({
        where: { tableId_key: { tableId, key } },
      }));

    let key: string;
    if (dto.key) {
      if (await taken(dto.key)) {
        throw new ConflictException(`Column key "${dto.key}" already exists`);
      }
      key = dto.key;
    } else {
      key = await uniquify(toColumnKey(dto.name), '_', taken);
    }

    if (constraints.primary) {
      await tx.column.updateMany({
        where: { tableId, primary: true },
        data: { primary: false },
      });
    }

    return tx.column.create({
      data: {
        tableId,
        name: dto.name,
        key,
        type: dto.type,
        ...constraints,
        options: options ? JSON.stringify(options) : null,
        order,
      },
    });
  }

  async update(
    tableId: string,
    columnId: string,
    dto: UpdateColumnDto,
  ): Promise<ColumnDto> {
    const column = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getColumn(tx, tableId, columnId);
      const type = dto.type ?? existing.type;

      if (
        existing.primary &&
        dto.primary !== false &&
        (dto.required === false || dto.unique === false)
      ) {
        throw new BadRequestException(
          'A primary key column is always required and unique. Unset `primary` first.',
        );
      }
      const next = resolveConstraints(type, {
        required: dto.required ?? existing.required,
        unique: dto.unique ?? existing.unique,
        primary: dto.primary ?? existing.primary,
      });

      if (next.required && !existing.required) {
        const empty = await countEmptyCells(tx, tableId, existing.key);
        if (empty > 0) {
          throw new ConflictException(
            `${empty} row(s) have no value for "${existing.name}". Fill them in before making the column required.`,
          );
        }
      }
      if (next.unique && (!existing.unique || type !== existing.type)) {
        const dupes = await findDuplicateValues(tx, tableId, existing.key);
        if (dupes.length > 0) {
          throw new ConflictException(
            `"${existing.name}" has duplicate values (${dupes.map(String).join(', ')}). Resolve them before making the column unique.`,
          );
        }
      }
      if (next.primary && !existing.primary) {
        await tx.column.updateMany({
          where: { tableId, primary: true },
          data: { primary: false },
        });
      }

      const options =
        dto.options !== undefined || dto.type !== undefined
          ? normalizeOptions(
              type,
              dto.options ??
                (JSON.parse(existing.options ?? '{}') as ColumnOptions),
            )
          : undefined;

      return tx.column.update({
        where: { id: columnId },
        data: {
          name: dto.name,
          type: dto.type,
          ...next,
          options:
            options === undefined
              ? undefined
              : options
                ? JSON.stringify(options)
                : null,
        },
      });
    });

    await this.audit.record({
      action: 'column.update',
      entity: 'column',
      entityId: columnId,
      detail: { tableId, key: column.key, changes: dto },
    });
    return toColumnDto(column);
  }

  /** Deletes the column and strips its key from every row's data. */
  async remove(tableId: string, columnId: string): Promise<void> {
    const column = await this.getColumn(this.prisma, tableId, columnId);
    await this.prisma.$transaction([
      this.prisma.$executeRawUnsafe(
        `UPDATE "Row" SET "data" = json_remove("data", ?) WHERE "tableId" = ?`,
        `$."${column.key}"`,
        tableId,
      ),
      this.prisma.column.delete({ where: { id: columnId } }),
    ]);
    await this.audit.record({
      action: 'column.delete',
      entity: 'column',
      entityId: columnId,
      detail: {
        tableId,
        key: column.key,
        name: column.name,
        wasPrimary: column.primary,
      },
    });
  }

  async reorder(tableId: string, dto: ReorderColumnsDto): Promise<ColumnDto[]> {
    await this.assertTable(tableId);
    const columns = await this.prisma.column.findMany({ where: { tableId } });
    const ids = new Set(columns.map((c) => c.id));
    if (
      dto.columnIds.length !== ids.size ||
      !dto.columnIds.every((id) => ids.has(id))
    ) {
      throw new BadRequestException(
        'columnIds must contain every column of the table exactly once',
      );
    }

    const updated = await this.prisma.$transaction(
      dto.columnIds.map((id, order) =>
        this.prisma.column.update({ where: { id }, data: { order } }),
      ),
    );
    await this.audit.record({
      action: 'column.reorder',
      entity: 'table',
      entityId: tableId,
      detail: { order: updated.map((c) => c.key) },
    });
    return updated.map(toColumnDto);
  }

  private async assertTable(tableId: string) {
    const exists = await this.prisma.table.findUnique({
      where: { id: tableId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Table not found');
  }

  private async getColumn(
    db: PrismaTx | PrismaService,
    tableId: string,
    columnId: string,
  ) {
    const column = await db.column.findFirst({
      where: { id: columnId, tableId },
    });
    if (!column) throw new NotFoundException('Column not found');
    return column;
  }
}

function resolveConstraints(type: string, input: Constraints): Constraints {
  const c = input.primary
    ? { required: true, unique: true, primary: true }
    : input;
  if ((c.unique || c.primary) && !KEYABLE_TYPES.has(type)) {
    throw new BadRequestException(
      `${type} columns cannot be ${c.primary ? 'the primary key' : 'unique'}; use one of ${[...KEYABLE_TYPES].join(', ')}`,
    );
  }
  return c;
}

function normalizeOptions(
  type: string,
  options: ColumnOptions | undefined,
): ColumnOptions | null {
  if (!CHOICE_TYPES.has(type)) return null;
  const choices = options?.choices ?? [];
  if (choices.length === 0) {
    throw new BadRequestException(
      `${type} columns need at least one entry in options.choices`,
    );
  }
  return { choices };
}
