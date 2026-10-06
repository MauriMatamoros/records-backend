import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'ncontains',
  'startsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'empty',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

const TEXT_OPS: FilterOperator[] = [
  'eq',
  'neq',
  'contains',
  'ncontains',
  'startsWith',
  'in',
  'empty',
];
const RANGE_OPS: FilterOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];

/** Which operators make sense for each column type (also served to the UI). */
export const OPERATORS_BY_TYPE: Record<ColumnType, FilterOperator[]> = {
  [ColumnType.TEXT]: TEXT_OPS,
  [ColumnType.LONG_TEXT]: ['contains', 'ncontains', 'empty'],
  [ColumnType.URL]: TEXT_OPS,
  [ColumnType.EMAIL]: TEXT_OPS,
  [ColumnType.NUMBER]: [...RANGE_OPS, 'in', 'empty'],
  [ColumnType.DATE]: [...RANGE_OPS, 'empty'],
  [ColumnType.BOOLEAN]: ['eq'],
  [ColumnType.SELECT]: ['eq', 'neq', 'in', 'empty'],
  [ColumnType.MULTI_SELECT]: ['eq', 'neq', 'in', 'empty'],
};

/** Row timestamps can be range-filtered like DATE columns. */
const SYSTEM_FIELDS = new Set(['createdAt', 'updatedAt']);
const SYSTEM_OPS: FilterOperator[] = ['gt', 'gte', 'lt', 'lte'];

const MAX_CONDITIONS = 50;
const MAX_IN_VALUES = 100;

export type RawFilter = Record<
  string,
  string | string[] | Record<string, string | string[]>
>;

export interface FilterSql {
  clauses: string[];
  params: unknown[];
}

/**
 * Translates `filter[field][op]=value` query params into SQLite JSON1 clauses.
 * `filter[field]=value` is shorthand for `eq`; repeating a param adds another
 * condition. Field names are checked against the table's columns before being
 * placed in a JSON path; every value is a bound parameter.
 */
export function buildFilterSql(
  raw: RawFilter | undefined,
  columns: ColumnDto[],
): FilterSql {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out: FilterSql = { clauses: [], params: [] };

  for (const [field, spec] of Object.entries(raw ?? {})) {
    const ops: Record<string, string | string[]> =
      typeof spec === 'string' || Array.isArray(spec) ? { eq: spec } : spec;
    if (typeof ops !== 'object' || ops === null) {
      throw new BadRequestException(`Invalid filter for "${field}"`);
    }

    for (const [op, values] of Object.entries(ops)) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (typeof value !== 'string') {
          throw new BadRequestException(`filter[${field}][${op}] must be a string`);
        }
        if (SYSTEM_FIELDS.has(field)) {
          addSystemCondition(out, field, op, value);
        } else {
          const column = byKey.get(field);
          if (!column) {
            throw new BadRequestException(`Unknown filter column "${field}"`);
          }
          addColumnCondition(out, column, op, value);
        }
        if (out.clauses.length > MAX_CONDITIONS) {
          throw new BadRequestException(
            `At most ${MAX_CONDITIONS} filter conditions are allowed`,
          );
        }
      }
    }
  }
  return out;
}

function addSystemCondition(
  out: FilterSql,
  field: string,
  op: string,
  value: string,
) {
  if (!SYSTEM_OPS.includes(op as FilterOperator)) {
    throw new BadRequestException(
      `filter[${field}] supports: ${SYSTEM_OPS.join(', ')}`,
    );
  }
  if (!isISO8601(value)) {
    throw new BadRequestException(`filter[${field}][${op}] must be an ISO 8601 date`);
  }
  out.clauses.push(`julianday("${field}") ${COMPARATORS[op]} julianday(?)`);
  out.params.push(value);
}

const COMPARATORS: Record<string, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function addColumnCondition(
  out: FilterSql,
  column: ColumnDto,
  op: string,
  value: string,
) {
  const allowed = OPERATORS_BY_TYPE[column.type];
  if (!allowed.includes(op as FilterOperator)) {
    throw new BadRequestException(
      `Operator "${op}" is not supported for ${column.type} column "${column.key}" (allowed: ${allowed.join(', ')})`,
    );
  }

  const path = `$."${column.key}"`;
  const x = `json_extract("data", ?)`;
  const push = (clause: string, ...params: unknown[]) => {
    out.clauses.push(clause);
    out.params.push(...params);
  };

  if (op === 'empty') {
    const wantEmpty = value === '' || value === 'true';
    if (!wantEmpty && value !== 'false') {
      throw new BadRequestException(`filter[${column.key}][empty] must be true or false`);
    }
    const isEmpty =
      column.type === ColumnType.MULTI_SELECT
        ? `(${x} IS NULL OR json_array_length("data", ?) = 0)`
        : `(${x} IS NULL OR ${x} = '')`;
    push(wantEmpty ? isEmpty : `NOT ${isEmpty}`, path, path);
    return;
  }

  if (column.type === ColumnType.MULTI_SELECT) {
    const list = op === 'in' ? splitList(value) : [value];
    const has = `EXISTS (SELECT 1 FROM json_each("Row"."data", ?) WHERE json_each.value IN (${list.map(() => '?').join(', ')}))`;
    push(op === 'neq' ? `NOT ${has}` : has, path, ...list);
    return;
  }

  switch (op) {
    case 'eq':
      return push(`${x} = ?`, path, convert(column, value));
    case 'neq':
      return push(`(${x} IS NULL OR ${x} != ?)`, path, path, convert(column, value));
    case 'in': {
      const list = splitList(value).map((v) => convert(column, v));
      return push(`${x} IN (${list.map(() => '?').join(', ')})`, path, ...list);
    }
    case 'contains':
      return push(`LOWER(CAST(${x} AS TEXT)) LIKE ? ESCAPE '\\'`, path, `%${escapeLike(value.toLowerCase())}%`);
    case 'ncontains':
      return push(
        `(${x} IS NULL OR LOWER(CAST(${x} AS TEXT)) NOT LIKE ? ESCAPE '\\')`,
        path,
        path,
        `%${escapeLike(value.toLowerCase())}%`,
      );
    case 'startsWith':
      return push(`LOWER(CAST(${x} AS TEXT)) LIKE ? ESCAPE '\\'`, path, `${escapeLike(value.toLowerCase())}%`);
    default: {
      const cmp = COMPARATORS[op];
      if (column.type === ColumnType.DATE) {
        return push(`julianday(${x}) ${cmp} julianday(?)`, path, convert(column, value));
      }
      return push(`${x} ${cmp} ?`, path, convert(column, value));
    }
  }
}

function convert(column: ColumnDto, value: string): unknown {
  switch (column.type) {
    case ColumnType.NUMBER: {
      const n = Number(value);
      if (value.trim() === '' || !Number.isFinite(n)) {
        throw new BadRequestException(`filter[${column.key}] must be a number`);
      }
      return n;
    }
    case ColumnType.BOOLEAN:
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException(`filter[${column.key}] must be true or false`);
      }
      // json_extract returns 1/0 for JSON booleans.
      return value === 'true' ? 1 : 0;
    case ColumnType.DATE:
      if (!isISO8601(value)) {
        throw new BadRequestException(`filter[${column.key}] must be an ISO 8601 date`);
      }
      return value;
    case ColumnType.EMAIL:
      return value.toLowerCase();
    default:
      return value;
  }
}

function splitList(value: string): string[] {
  const list = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (list.length === 0 || list.length > MAX_IN_VALUES) {
    throw new BadRequestException(
      `"in" filters need 1–${MAX_IN_VALUES} comma-separated values`,
    );
  }
  return list;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}
