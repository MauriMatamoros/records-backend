export enum ColumnType {
  TEXT = 'TEXT',
  LONG_TEXT = 'LONG_TEXT',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  DATE = 'DATE',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  URL = 'URL',
  EMAIL = 'EMAIL',
}

export const CHOICE_TYPES: ReadonlySet<string> = new Set([
  ColumnType.SELECT,
  ColumnType.MULTI_SELECT,
]);

/** Types whose values are scalar and stable enough to identify a row. */
export const KEYABLE_TYPES: ReadonlySet<string> = new Set([
  ColumnType.TEXT,
  ColumnType.NUMBER,
  ColumnType.DATE,
  ColumnType.URL,
  ColumnType.EMAIL,
]);

export interface ColumnOptions {
  /** Allowed values for SELECT / MULTI_SELECT columns. */
  choices?: string[];
}

/** Column keys are interpolated into SQLite JSON paths, so keep them strict. */
export const COLUMN_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
