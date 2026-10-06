import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { parseJson } from '../common/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertUniqueValues } from '../tables/column-constraints.js';
import { toRowDto } from '../tables/mappers.js';
import { TablesService } from '../tables/tables.service.js';
import {
  CreateRowDto,
  ListRowsQueryDto,
  RowDto,
  UpdateRowDto,
} from './dto/row.dto.js';
import { mergeRowData, RowData } from './row-data-validator.js';
import { RowQueryService } from './row-query.service.js';

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tables: TablesService,
    private readonly rowQuery: RowQueryService,
    private readonly audit: AuditService,
  ) {}

  async list(tableId: string, query: ListRowsQueryDto) {
    const table = await this.tables.get(tableId);
    return this.rowQuery.query(table, query);
  }

  async get(tableId: string, rowId: string): Promise<RowDto> {
    return toRowDto(await this.findRow(tableId, rowId));
  }

  async create(tableId: string, dto: CreateRowDto): Promise<RowDto> {
    const table = await this.tables.get(tableId);
    const data = mergeRowData(table.columns, {}, dto.data);
    const row = await this.prisma.$transaction(async (tx) => {
      await assertUniqueValues(
        tx,
        tableId,
        table.columns,
        data,
        Object.keys(data),
      );
      return tx.row.create({ data: { tableId, data: JSON.stringify(data) } });
    });
    await this.audit.record({
      action: 'row.create',
      entity: 'row',
      entityId: row.id,
      detail: { tableId, data },
    });
    return toRowDto(row);
  }

  async update(
    tableId: string,
    rowId: string,
    dto: UpdateRowDto,
  ): Promise<RowDto> {
    const table = await this.tables.get(tableId);
    const existing = await this.findRow(tableId, rowId);
    const before = parseJson<RowData>(existing.data, {});
    const after = mergeRowData(table.columns, before, dto.data);

    const row = await this.prisma.$transaction(async (tx) => {
      await assertUniqueValues(
        tx,
        tableId,
        table.columns,
        after,
        Object.keys(dto.data),
        rowId,
      );
      return tx.row.update({
        where: { id: rowId },
        data: { data: JSON.stringify(after) },
      });
    });
    await this.audit.record({
      action: 'row.update',
      entity: 'row',
      entityId: rowId,
      detail: { tableId, changes: diff(before, after) },
    });
    return toRowDto(row);
  }

  async remove(tableId: string, rowId: string): Promise<void> {
    const row = await this.findRow(tableId, rowId);
    await this.prisma.row.delete({ where: { id: rowId } });
    await this.audit.record({
      action: 'row.delete',
      entity: 'row',
      entityId: rowId,
      detail: { tableId, data: parseJson<RowData>(row.data, {}) },
    });
  }

  private async findRow(tableId: string, rowId: string) {
    const row = await this.prisma.row.findFirst({
      where: { id: rowId, tableId },
    });
    if (!row) throw new NotFoundException('Row not found');
    return row;
  }
}

function diff(before: RowData, after: RowData) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}
