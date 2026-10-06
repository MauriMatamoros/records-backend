import { parseJson } from '../common/json.js';
import type { Column, Row, Table } from '../generated/prisma/client.js';
import { ColumnOptions, ColumnType } from './column-type.enum.js';
import type { ColumnDto } from './dto/column.dto.js';
import type { TableDto } from './dto/table.dto.js';

export function toColumnDto(column: Column): ColumnDto {
  return {
    id: column.id,
    name: column.name,
    key: column.key,
    type: column.type as ColumnType,
    options: parseJson<ColumnOptions>(column.options, {}),
    order: column.order,
    required: column.required || column.primary,
    unique: column.unique || column.primary,
    primary: column.primary,
  };
}

export function toTableDto(table: Table & { columns: Column[] }): TableDto {
  return {
    id: table.id,
    name: table.name,
    slug: table.slug,
    description: table.description,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
    primaryKey: table.columns.find((c) => c.primary)?.key ?? null,
    columns: [...table.columns]
      .sort((a, b) => a.order - b.order)
      .map(toColumnDto),
  };
}

export function toRowDto(row: Row) {
  return {
    id: row.id,
    data: parseJson<Record<string, unknown>>(row.data, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
