import { BadRequestException } from '@nestjs/common';
import { ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';
import { mergeRowData } from './row-data-validator.js';

const col = (
  key: string,
  type: ColumnType,
  extra: Partial<ColumnDto> = {},
): ColumnDto => ({
  id: key,
  name: key,
  key,
  type,
  options: {},
  order: 0,
  required: false,
  unique: false,
  primary: false,
  ...extra,
});

const columns = [
  col('name', ColumnType.TEXT, { required: true }),
  col('seats', ColumnType.NUMBER),
  col('status', ColumnType.SELECT, { options: { choices: ['A', 'B'] } }),
  col('tags', ColumnType.MULTI_SELECT, { options: { choices: ['x', 'y'] } }),
  col('email', ColumnType.EMAIL),
];

function fieldErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    if (err instanceof BadRequestException) {
      return (err.getResponse() as { fields: Record<string, string> }).fields;
    }
    throw err;
  }
  throw new Error('expected validation to fail');
}

describe('mergeRowData', () => {
  it('accepts valid values and normalizes them', () => {
    expect(
      mergeRowData(columns, {}, {
        name: 'Acme',
        seats: 3,
        tags: ['x', 'x'],
        email: 'A@B.CO',
      }),
    ).toEqual({ name: 'Acme', seats: 3, tags: ['x'], email: 'a@b.co' });
  });

  it('reports every invalid field at once', () => {
    expect(
      fieldErrors(() =>
        mergeRowData(columns, {}, { seats: '3', status: 'C', nope: 1 }),
      ),
    ).toEqual({
      seats: 'Must be a number',
      status: 'Must be one of: A, B',
      nope: 'Unknown column',
      name: 'Required',
    });
  });

  it('merges partial updates and clears cells with null', () => {
    expect(
      mergeRowData(columns, { name: 'Acme', seats: 3 }, { seats: null }),
    ).toEqual({ name: 'Acme' });
  });

  it('does not re-validate untouched stale values', () => {
    const stale = { name: 'Acme', status: 'REMOVED_CHOICE' };
    expect(mergeRowData(columns, stale, { seats: 1 })).toEqual({
      ...stale,
      seats: 1,
    });
  });

  it('enforces required on the merged result', () => {
    expect(
      fieldErrors(() => mergeRowData(columns, { name: 'Acme' }, { name: '' })),
    ).toEqual({ name: 'Required' });
  });
});
