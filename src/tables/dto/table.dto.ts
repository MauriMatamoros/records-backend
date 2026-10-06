import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { ColumnDto, CreateColumnDto } from './column.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateTableDto {
  @ApiProperty({
    description: 'Human-readable table name.',
    example: 'Client Accounts',
    maxLength: 100,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description:
      'URL identifier used by the public API (`/api/v1/tables/{slug}`). Generated from `name` when omitted. Changing it later breaks existing consumers.',
    example: 'client-accounts',
    pattern: SLUG_PATTERN.source,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase letters/digits separated by single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'What this table holds and who owns it.',
    example: 'Active client accounts synced to the billing service.',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Columns to create together with the table.',
    type: [CreateColumnDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateColumnDto)
  columns?: CreateColumnDto[];
}

export class UpdateTableDto extends PartialType(
  OmitType(CreateTableDto, ['columns'] as const),
) {}

class TableBaseDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'Client Accounts' })
  name: string;

  @ApiProperty({ example: 'client-accounts' })
  slug: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  description: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TableSummaryDto extends TableBaseDto {
  @ApiProperty({ example: 6 })
  columnCount: number;

  @ApiProperty({ example: 1240 })
  rowCount: number;
}

export class TableDto extends TableBaseDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Key of the primary-key column, if the table has one.',
    example: 'account_id',
  })
  primaryKey: string | null;

  @ApiProperty({ type: [ColumnDto], description: 'Ordered by `order`.' })
  columns: ColumnDto[];
}

export class ListTablesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search over name, slug and description.',
    example: 'client',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class PaginatedTablesDto {
  @ApiProperty({ type: [TableSummaryDto] })
  items: TableSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
