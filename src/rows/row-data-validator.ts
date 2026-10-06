import { BadRequestException } from '@nestjs/common';
import { isEmail, isISO8601, isURL } from 'class-validator';
import { ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';

export type RowData = Record<string, unknown>;

const MAX_LENGTH: Partial<Record<ColumnType, number>> = {
  [ColumnType.TEXT]: 1_000,
  [ColumnType.LONG_TEXT]: 50_000,
};

/**
 * Validates `input` against the table's columns and merges it into `current`.
 *
 * - Only keys present in `input` are type-checked, so stale values left behind
 *   by a column type/choices change never block edits to other cells.
 * - `null` or `""` clears a cell.
 * - Required columns are checked on the merged result.
 *
 * Throws 400 with a per-column error map.
 */
export function mergeRowData(
  columns: ColumnDto[],
  current: RowData,
  input: RowData,
): RowData {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const errors: Record<string, string> = {};
  const merged: RowData = { ...current };

  for (const [key, raw] of Object.entries(input)) {
    const column = byKey.get(key);
    if (!column) {
      errors[key] = 'Unknown column';
      continue;
    }
    if (raw === null || raw === '') {
      delete merged[key];
      continue;
    }
    const result = coerce(column, raw);
    if ('error' in result) errors[key] = result.error;
    else merged[key] = result.value;
  }

  for (const column of columns) {
    if (column.required && isEmpty(merged[column.key]) && !errors[column.key]) {
      errors[column.key] = 'Required';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Row data is invalid',
      fields: errors,
    });
  }
  return merged;
}

function isEmpty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

type Coerced = { value: unknown } | { error: string };

function coerce(column: ColumnDto, raw: unknown): Coerced {
  const choices = column.options.choices ?? [];

  switch (column.type) {
    case ColumnType.TEXT:
    case ColumnType.LONG_TEXT: {
      if (typeof raw !== 'string') return { error: 'Must be text' };
      const max = MAX_LENGTH[column.type]!;
      return raw.length > max
        ? { error: `Must be at most ${max} characters` }
        : { value: raw };
    }
    case ColumnType.NUMBER:
      return typeof raw === 'number' && Number.isFinite(raw)
        ? { value: raw }
        : { error: 'Must be a number' };
    case ColumnType.BOOLEAN:
      return typeof raw === 'boolean'
        ? { value: raw }
        : { error: 'Must be true or false' };
    case ColumnType.DATE:
      return typeof raw === 'string' && isISO8601(raw, { strict: true })
        ? { value: raw }
        : { error: 'Must be an ISO 8601 date (YYYY-MM-DD)' };
    case ColumnType.SELECT:
      return typeof raw === 'string' && choices.includes(raw)
        ? { value: raw }
        : { error: `Must be one of: ${choices.join(', ')}` };
    case ColumnType.MULTI_SELECT: {
      if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string')) {
        return { error: 'Must be a list of options' };
      }
      const invalid = raw.filter((v) => !choices.includes(v));
      return invalid.length
        ? { error: `Unknown option(s): ${invalid.join(', ')}` }
        : { value: [...new Set(raw)] };
    }
    case ColumnType.URL:
      return typeof raw === 'string' &&
        isURL(raw, { protocols: ['http', 'https'], require_protocol: true })
        ? { value: raw }
        : { error: 'Must be an http(s) URL' };
    case ColumnType.EMAIL:
      return typeof raw === 'string' && isEmail(raw)
        ? { value: raw.toLowerCase() }
        : { error: 'Must be an email address' };
    default:
      return { error: `Unsupported column type ${column.type as string}` };
  }
}
