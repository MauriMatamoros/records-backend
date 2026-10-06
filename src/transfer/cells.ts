import { isEmail, isISO8601, isURL } from 'class-validator';
import { ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';
import { isBlank, SheetValue } from './spreadsheet.js';

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x', '✓', '✔']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

const pad = (n: number) => String(n).padStart(2, '0');

/** Excel stores date-only cells as UTC midnight. */
function dateToIso(d: Date): string {
  const dateOnly =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString();
}

/**
 * Converts a spreadsheet cell into the JSON value expected for the column.
 * Returns `undefined` for blank cells. Unconvertible input is passed through
 * unchanged so the row validator reports a precise error for it.
 */
export function parseCell(column: ColumnDto, raw: SheetValue): unknown {
  if (isBlank(raw)) return undefined;

  switch (column.type) {
    case ColumnType.NUMBER: {
      if (typeof raw === 'number') return raw;
      const n = Number(String(raw).replace(/[\s,$€£%]/g, ''));
      return Number.isFinite(n) ? n : String(raw);
    }
    case ColumnType.BOOLEAN: {
      if (typeof raw === 'boolean') return raw;
      const s = String(raw).trim().toLowerCase();
      if (TRUE_WORDS.has(s)) return true;
      if (FALSE_WORDS.has(s)) return false;
      return String(raw);
    }
    case ColumnType.DATE: {
      if (raw instanceof Date) return dateToIso(raw);
      const s = String(raw).trim();
      if (isISO8601(s, { strict: true })) return s;
      const d = new Date(s);
      return Number.isNaN(d.getTime())
        ? s
        : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case ColumnType.MULTI_SELECT:
      return String(raw)
        .split(/[,;\n]/)
        .map((v) => v.trim())
        .filter(Boolean);
    default:
      return raw instanceof Date ? dateToIso(raw) : String(raw).trim();
  }
}

/** Converts a stored value into a spreadsheet cell. */
export function formatCell(
  column: ColumnDto,
  value: unknown,
  format: 'csv' | 'xlsx',
): SheetValue {
  if (value === undefined || value === null) return null;
  switch (column.type) {
    case ColumnType.MULTI_SELECT:
      return Array.isArray(value) ? value.join(', ') : String(value);
    case ColumnType.NUMBER:
      return typeof value === 'number' ? value : String(value);
    case ColumnType.BOOLEAN:
      return typeof value === 'boolean' ? value : String(value);
    case ColumnType.DATE: {
      const s = String(value);
      if (format === 'xlsx' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      }
      return s;
    }
    default:
      return String(value);
  }
}

export interface InferredColumn {
  type: ColumnType;
  choices?: string[];
}

/** Guesses a column type from sample values when creating a table from a file. */
export function inferColumn(values: SheetValue[]): InferredColumn {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return { type: ColumnType.TEXT };

  const strings = present.map((v) =>
    v instanceof Date ? dateToIso(v) : String(v).trim(),
  );
  const all = (pred: (v: SheetValue, s: string) => boolean) =>
    present.every((v, i) => pred(v, strings[i]));

  const isNumeric = (v: SheetValue, s: string) =>
    typeof v === 'number' ||
    (s !== '' && Number.isFinite(Number(s.replace(/,/g, ''))));
  const isBooleanWord = (v: SheetValue, s: string) =>
    typeof v === 'boolean' ||
    TRUE_WORDS.has(s.toLowerCase()) ||
    FALSE_WORDS.has(s.toLowerCase());

  // A column of only 1/0 is more likely a count than a flag.
  if (all(isBooleanWord) && !all(isNumeric)) {
    return { type: ColumnType.BOOLEAN };
  }
  if (all(isNumeric)) return { type: ColumnType.NUMBER };
  if (
    all(
      (v, s) =>
        v instanceof Date || (/^\d{4}-\d{2}-\d{2}/.test(s) && isISO8601(s)),
    )
  ) {
    return { type: ColumnType.DATE };
  }
  if (all((_v, s) => isEmail(s))) return { type: ColumnType.EMAIL };
  if (
    all((_v, s) =>
      isURL(s, { protocols: ['http', 'https'], require_protocol: true }),
    )
  ) {
    return { type: ColumnType.URL };
  }
  if (strings.some((s) => s.length > 255 || s.includes('\n'))) {
    return { type: ColumnType.LONG_TEXT };
  }

  const distinct = [...new Set(strings)];
  if (distinct.length <= 12 && present.length >= distinct.length * 3) {
    return { type: ColumnType.SELECT, choices: distinct.sort() };
  }
  return { type: ColumnType.TEXT };
}
