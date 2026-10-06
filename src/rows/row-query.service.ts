import { BadRequestException, Injectable } from '@nestjs/common';
import { paginationMeta } from '../common/dto/pagination.dto.js';
import type { Row } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TableDto } from '../tables/dto/table.dto.js';
import { toRowDto } from '../tables/mappers.js';
import type { ListRowsQueryDto, PaginatedRowsDto } from './dto/row.dto.js';
import { buildFilterSql, escapeLike, RawFilter } from './row-filter.js';

/** The search/filter/sort part of a rows query (no pagination). */
export interface RowSelection {
  q?: string;
  filter?: RawFilter;
  match?: 'all' | 'any';
  sort?: string;
}

const FETCH_BATCH = 500;

/**
 * Filtering, search, sorting and pagination over JSON row data using SQLite's
 * JSON1 functions. Column keys are validated against the table schema (and
 * COLUMN_KEY_PATTERN) before being used in JSON paths; all values are bound
 * parameters.
 */
@Injectable()
export class RowQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(
    table: TableDto,
    query: ListRowsQueryDto,
  ): Promise<PaginatedRowsDto> {
    const { whereSql, params, order } = this.compile(table, query);

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "Row" WHERE ${whereSql} ORDER BY ${order.sql} LIMIT ? OFFSET ?`,
        ...params,
        ...order.params,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ),
      this.prisma.$queryRawUnsafe<{ count: number | bigint }[]>(
        `SELECT COUNT(*) AS "count" FROM "Row" WHERE ${whereSql}`,
        ...params,
      ),
    ]);

    const rows = await this.fetchInOrder(idRows.map((r) => r.id));
    return {
      items: rows.map(toRowDto),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        Number(countRows[0]?.count ?? 0),
      ),
    };
  }

  /** Every matching row (used by exports), in batches to bound memory per query. */
  async *selectAll(
    table: TableDto,
    selection: RowSelection,
    limit: number,
  ): AsyncGenerator<Row[]> {
    const { whereSql, params, order } = this.compile(table, selection);
    const idRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "Row" WHERE ${whereSql} ORDER BY ${order.sql} LIMIT ?`,
      ...params,
      ...order.params,
      limit,
    );
    for (let i = 0; i < idRows.length; i += FETCH_BATCH) {
      yield this.fetchInOrder(
        idRows.slice(i, i + FETCH_BATCH).map((r) => r.id),
      );
    }
  }

  private compile(table: TableDto, selection: RowSelection) {
    const columns = new Map(table.columns.map((c) => [c.key, c]));
    const where: string[] = ['"tableId" = ?'];
    const params: unknown[] = [table.id];

    if (selection.q) {
      where.push(
        `EXISTS (SELECT 1 FROM json_each("Row"."data") WHERE CAST(json_each.value AS TEXT) LIKE ? ESCAPE '\\')`,
      );
      params.push(`%${escapeLike(selection.q)}%`);
    }

    const filters = buildFilterSql(selection.filter, table.columns);
    if (filters.clauses.length > 0) {
      const joiner = selection.match === 'any' ? ' OR ' : ' AND ';
      where.push(`(${filters.clauses.join(joiner)})`);
      params.push(...filters.params);
    }

    return {
      whereSql: where.join(' AND '),
      params,
      order: this.orderBy(selection.sort, columns),
    };
  }

  private async fetchInOrder(ids: string[]): Promise<Row[]> {
    const rows = await this.prisma.row.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  private orderBy(sort: string | undefined, columns: Map<string, unknown>) {
    const desc = sort?.startsWith('-') ?? false;
    const field = sort?.replace(/^-/, '') || 'createdAt';
    const dir = desc ? 'DESC' : 'ASC';

    if (field === 'createdAt' || field === 'updatedAt') {
      return { sql: `"${field}" ${dir}, "id" ${dir}`, params: [] };
    }
    if (!columns.has(field)) {
      throw new BadRequestException(`Unknown sort column "${field}"`);
    }
    // Empty cells sort last regardless of direction.
    return {
      sql: `json_extract("data", ?) IS NULL, json_extract("data", ?) ${dir}, "createdAt" ASC, "id" ASC`,
      params: [`$."${field}"`, `$."${field}"`],
    };
  }
}
