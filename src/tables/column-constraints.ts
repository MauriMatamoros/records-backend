import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ColumnDto } from './dto/column.dto.js';

/** PrismaService or an interactive-transaction client. */
type Db = Pick<PrismaService, '$queryRawUnsafe'>;

const path = (key: string) => `$."${key}"`;

export async function countEmptyCells(
  db: Db,
  tableId: string,
  key: string,
): Promise<number> {
  const [row] = await db.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT COUNT(*) AS "n" FROM "Row" WHERE "tableId" = ? AND (json_extract("data", ?) IS NULL OR json_extract("data", ?) = '')`,
    tableId,
    path(key),
    path(key),
  );
  return Number(row?.n ?? 0);
}

/** Up to `limit` values that appear in more than one row. */
export async function findDuplicateValues(
  db: Db,
  tableId: string,
  key: string,
  limit = 5,
): Promise<unknown[]> {
  const rows = await db.$queryRawUnsafe<{ v: unknown }[]>(
    `SELECT json_extract("data", ?) AS "v" FROM "Row"
     WHERE "tableId" = ? AND json_extract("data", ?) IS NOT NULL
     GROUP BY "v" HAVING COUNT(*) > 1 LIMIT ?`,
    path(key),
    tableId,
    path(key),
    limit,
  );
  return rows.map((r) => r.v);
}

/**
 * Throws 409 when a unique/primary column value in `data` already exists in
 * another row. Must run inside the same transaction as the write.
 */
export async function assertUniqueValues(
  db: Db,
  tableId: string,
  columns: ColumnDto[],
  data: Record<string, unknown>,
  keysToCheck: Iterable<string>,
  excludeRowId?: string,
): Promise<void> {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const fields: Record<string, string> = {};

  for (const key of keysToCheck) {
    const column = byKey.get(key);
    const value = data[key];
    if (!column || !(column.unique || column.primary)) continue;
    if (value === undefined || value === null || value === '') continue;

    const clash = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "Row" WHERE "tableId" = ? AND json_extract("data", ?) = ? AND "id" != ? LIMIT 1`,
      tableId,
      path(key),
      value,
      excludeRowId ?? '',
    );
    if (clash.length > 0) {
      fields[key] = column.primary
        ? `Primary key "${String(value)}" already exists`
        : `Value "${String(value)}" must be unique`;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: 'Row violates a uniqueness constraint',
      fields,
    });
  }
}
