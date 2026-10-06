import { BadRequestException } from '@nestjs/common';
import { mergeRowData, RowData } from '../rows/row-data-validator.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';
import { toColumnKey } from '../tables/slugify.js';
import { parseCell } from './cells.js';
import { isBlank, Sheet } from './spreadsheet.js';

export type ImportMode = 'append' | 'upsert';

export interface ExistingRow {
  id: string;
  data: RowData;
}

export interface ImportRowError {
  /** 1-based spreadsheet row number (the header is row 1). */
  row: number;
  fields: Record<string, string>;
}

export interface ImportPlan {
  mappedColumns: { header: string; key: string }[];
  ignoredHeaders: string[];
  creates: RowData[];
  updates: ExistingRow[];
  unchanged: number;
  errors: ImportRowError[];
}

const norm = (s: string) => s.trim().toLowerCase();
const valueKey = (v: unknown) => JSON.stringify(v);

/** Matches headers to columns by name, key, or the key a header would generate. */
export function mapHeaders(headers: string[], columns: ColumnDto[]) {
  const used = new Set<string>();
  const mapping: (ColumnDto | null)[] = [];
  const ignored: string[] = [];

  for (const header of headers) {
    const h = norm(header);
    const column =
      h === ''
        ? undefined
        : (columns.find((c) => norm(c.name) === h) ??
          columns.find((c) => c.key === h) ??
          columns.find((c) => c.key === toColumnKey(header)));
    if (column && !used.has(column.key)) {
      used.add(column.key);
      mapping.push(column);
    } else {
      mapping.push(null);
      if (header.trim() !== '') ignored.push(header);
    }
  }
  return { mapping, ignored };
}

/**
 * Validates every row of the sheet against the table and works out which rows
 * to create or update. Performs no I/O: `existing` holds the table's current
 * rows, loaded by the caller inside the same transaction as the writes.
 */
export function planImport(params: {
  sheet: Sheet;
  columns: ColumnDto[];
  mode: ImportMode;
  existing: ExistingRow[];
}): ImportPlan {
  const { sheet, columns, mode, existing } = params;
  const { mapping, ignored } = mapHeaders(sheet.headers, columns);
  const mappedColumns = mapping.flatMap((c, i) =>
    c ? [{ header: sheet.headers[i], key: c.key }] : [],
  );
  if (mappedColumns.length === 0) {
    throw new BadRequestException(
      `None of the file's headers match a column. Expected some of: ${columns.map((c) => c.name).join(', ')}`,
    );
  }

  const pk = columns.find((c) => c.primary);
  if (mode === 'upsert') {
    if (!pk) {
      throw new BadRequestException(
        'Upsert needs the table to have a primary key column',
      );
    }
    if (!mappedColumns.some((m) => m.key === pk.key)) {
      throw new BadRequestException(
        `Upsert needs a "${pk.name}" column in the file to match rows`,
      );
    }
  }

  // Unique-value ownership: column key → serialized value → row id.
  const uniqueCols = columns.filter((c) => c.unique || c.primary);
  const owners = new Map<string, Map<string, string>>(
    uniqueCols.map((c) => [c.key, new Map()]),
  );
  const byPk = new Map<string, ExistingRow>();
  for (const row of existing) {
    for (const c of uniqueCols) {
      const v = row.data[c.key];
      if (v !== undefined && v !== null) {
        owners.get(c.key)!.set(valueKey(v), row.id);
      }
    }
    if (pk && row.data[pk.key] !== undefined) {
      byPk.set(valueKey(row.data[pk.key]), row);
    }
  }

  const plan: ImportPlan = {
    mappedColumns,
    ignoredHeaders: ignored,
    creates: [],
    updates: [],
    unchanged: 0,
    errors: [],
  };

  sheet.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const input: RowData = {};
    mapping.forEach((column, i) => {
      if (!column || isBlank(cells[i] ?? null)) return;
      input[column.key] = parseCell(column, cells[i] ?? null);
    });

    const target =
      mode === 'upsert' && input[pk!.key] !== undefined
        ? byPk.get(valueKey(input[pk!.key]))
        : undefined;
    const selfId = target?.id ?? `new:${rowNumber}`;

    let merged: RowData;
    try {
      merged = mergeRowData(columns, target?.data ?? {}, input);
    } catch (err) {
      plan.errors.push({ row: rowNumber, fields: fieldsOf(err) });
      return;
    }

    const clashes: Record<string, string> = {};
    for (const c of uniqueCols) {
      const v = merged[c.key];
      if (v === undefined || v === null) continue;
      const owner = owners.get(c.key)!.get(valueKey(v));
      if (owner && owner !== selfId) {
        clashes[c.key] = owner.startsWith('new:')
          ? `"${String(v)}" also appears in row ${owner.slice(4)} of the file`
          : `"${String(v)}" already exists in the table`;
      }
    }
    if (Object.keys(clashes).length > 0) {
      plan.errors.push({ row: rowNumber, fields: clashes });
      return;
    }

    for (const c of uniqueCols) {
      const map = owners.get(c.key)!;
      const before = target?.data[c.key];
      if (before !== undefined && map.get(valueKey(before)) === selfId) {
        map.delete(valueKey(before));
      }
      if (merged[c.key] !== undefined) map.set(valueKey(merged[c.key]), selfId);
    }

    if (target) {
      if (valueKey(sortKeys(target.data)) === valueKey(sortKeys(merged))) {
        plan.unchanged++;
      } else {
        plan.updates.push({ id: target.id, data: merged });
        target.data = merged;
      }
    } else {
      plan.creates.push(merged);
    }
  });

  return plan;
}

function fieldsOf(err: unknown): Record<string, string> {
  if (err instanceof BadRequestException) {
    const body = err.getResponse() as { fields?: Record<string, string> };
    if (body.fields) return body.fields;
  }
  return { _row: (err as Error).message };
}

function sortKeys(data: RowData): RowData {
  return Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b)),
  );
}
