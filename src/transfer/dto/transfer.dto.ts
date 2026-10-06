import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ListRowsQueryDto } from '../../rows/dto/row.dto.js';
import { TableDto } from '../../tables/dto/table.dto.js';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1' || value === 'on';

export class ExportQueryDto extends OmitType(ListRowsQueryDto, [
  'page',
  'pageSize',
] as const) {
  @ApiPropertyOptional({
    description:
      'File format. Search, filters and sort apply exactly as in the rows listing, so the export matches the current view.',
    enum: ['csv', 'xlsx'],
    default: 'csv',
  })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'csv';
}

export class TemplateQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'xlsx';
}

export class ImportOptionsDto {
  @ApiPropertyOptional({
    description:
      '`append` adds every row. `upsert` matches rows by the table’s primary key: existing rows are updated (blank cells leave values unchanged) and the rest are added.',
    enum: ['append', 'upsert'],
    default: 'append',
  })
  @IsOptional()
  @IsIn(['append', 'upsert'])
  mode: 'append' | 'upsert' = 'append';

  @ApiPropertyOptional({
    description: 'Validate and report what would happen without writing.',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dryRun: boolean = false;

  @ApiPropertyOptional({
    description:
      'Import the valid rows even if some rows have errors. By default any error aborts the whole import.',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  skipInvalid: boolean = false;
}

export class CreateTableFromFileDto {
  @ApiPropertyOptional({
    description: 'Table name. Defaults to the file name.',
    example: 'Client Accounts',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Header of the column to use as primary key. Its values must be present and unique.',
    example: 'Account ID',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  primaryKey?: string;

  @ApiPropertyOptional({
    description: 'Return the inferred columns and validation report without creating anything.',
    default: false,
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dryRun: boolean = false;
}

export const FILE_UPLOAD_SCHEMA = (extra: Record<string, object>) => ({
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: '.csv or .xlsx (first sheet), max 20 MB / 50,000 rows. The first row must be headers.',
      },
      ...extra,
    },
  },
});

export class ImportRowErrorDto {
  @ApiProperty({
    description: 'Spreadsheet row number (the header is row 1).',
    example: 7,
  })
  row: number;

  @ApiProperty({
    description: 'Column key → error message.',
    example: { seats: 'Must be a number' },
  })
  fields: Record<string, string>;
}

export class MappedColumnDto {
  @ApiProperty({ example: 'Account ID' })
  header: string;

  @ApiProperty({ example: 'account_id' })
  key: string;
}

export class ImportResultDto {
  @ApiProperty({ description: 'True when nothing was written.' })
  dryRun: boolean;

  @ApiProperty({
    description: 'Whether rows were written (false on dry runs or when errors aborted the import).',
  })
  committed: boolean;

  @ApiProperty({ example: 120 })
  totalRows: number;

  @ApiProperty({ example: 100 })
  created: number;

  @ApiProperty({ example: 15 })
  updated: number;

  @ApiProperty({ description: 'Upsert rows identical to what is stored.', example: 3 })
  unchanged: number;

  @ApiProperty({ description: 'Rows with errors.', example: 2 })
  invalid: number;

  @ApiProperty({ type: [MappedColumnDto] })
  mappedColumns: MappedColumnDto[];

  @ApiProperty({
    description: 'Headers that did not match any column (their values are ignored).',
    example: ['Notes (old)'],
  })
  ignoredHeaders: string[];

  @ApiProperty({
    type: [ImportRowErrorDto],
    description: 'First 200 row errors.',
  })
  errors: ImportRowErrorDto[];
}

export class CreateTableFromFileResultDto extends ImportResultDto {
  @ApiPropertyOptional({
    type: TableDto,
    nullable: true,
    description: 'The created table, or the proposed schema on a dry run (without ids).',
  })
  table: TableDto | null;
}
