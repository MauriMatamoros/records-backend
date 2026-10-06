import { ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto } from '../tables/dto/column.dto.js';
import { inferColumn } from './cells.js';
import { planImport } from './import-planner.js';

const col = (
  key: string,
  name: string,
  type: ColumnType,
  extra: Partial<ColumnDto> = {},
): ColumnDto => ({
  id: key,
  key,
  name,
  type,
  options: {},
  order: 0,
  required: false,
  unique: false,
  primary: false,
  ...extra,
});

const columns = [
  col('sku', 'SKU', ColumnType.TEXT, { primary: true, required: true, unique: true }),
  col('qty', 'Quantity', ColumnType.NUMBER),
  col('active', 'Active', ColumnType.BOOLEAN),
];

describe('planImport', () => {
  it('maps headers by name or key and reports unknown headers', () => {
    const plan = planImport({
      sheet: { headers: ['SKU', 'qty', 'Comment'], rows: [['A', '3', 'x']] },
      columns,
      mode: 'append',
      existing: [],
    });
    expect(plan.mappedColumns.map((m) => m.key)).toEqual(['sku', 'qty']);
    expect(plan.ignoredHeaders).toEqual(['Comment']);
    expect(plan.creates).toEqual([{ sku: 'A', qty: 3 }]);
  });

  it('rejects duplicates against the table and within the file', () => {
    const plan = planImport({
      sheet: { headers: ['SKU'], rows: [['OLD'], ['NEW'], ['NEW']] },
      columns,
      mode: 'append',
      existing: [{ id: 'r1', data: { sku: 'OLD' } }],
    });
    expect(plan.creates).toEqual([{ sku: 'NEW' }]);
    expect(plan.errors.map((e) => e.row)).toEqual([2, 4]);
    expect(plan.errors[1].fields.sku).toContain('row 3');
  });

  it('upserts by primary key, leaving blank cells untouched', () => {
    const plan = planImport({
      sheet: {
        headers: ['SKU', 'Quantity', 'Active'],
        rows: [
          ['A', 5, null],
          ['B', 1, 'yes'],
          ['C', 2, 'no'],
        ],
      },
      columns,
      mode: 'upsert',
      existing: [
        { id: 'a', data: { sku: 'A', qty: 1, active: true } },
        { id: 'b', data: { sku: 'B', qty: 1, active: true } },
      ],
    });
    expect(plan.updates).toEqual([
      { id: 'a', data: { sku: 'A', qty: 5, active: true } },
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.creates).toEqual([{ sku: 'C', qty: 2, active: false }]);
  });
});

describe('inferColumn', () => {
  it.each([
    [['1', '2', '3.5'], ColumnType.NUMBER],
    [['1', '0', '1'], ColumnType.NUMBER],
    [['yes', 'no', 'yes'], ColumnType.BOOLEAN],
    [['2026-01-01', '2026-02-03'], ColumnType.DATE],
    [['a@b.co', 'c@d.co'], ColumnType.EMAIL],
    [['A', 'B', 'A', 'B', 'A', 'B'], ColumnType.SELECT],
    [['Acme', 'Globex'], ColumnType.TEXT],
  ])('%j → %s', (values, type) => {
    expect(inferColumn(values).type).toBe(type);
  });
});
