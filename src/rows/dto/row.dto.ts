import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import type { RawFilter } from '../row-filter.js';
import {
  IsIn,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';

const ROW_DATA_EXAMPLE = {
  company: 'Acme Inc.',
  seats: 42,
  status: 'Active',
  renewal_date: '2026-11-30',
  regions: ['NA', 'EU'],
};

export class CreateRowDto {
  @ApiProperty({
    description:
      'Cell values keyed by column `key`. Values must match each column’s type: TEXT/LONG_TEXT/URL/EMAIL → string, NUMBER → number, BOOLEAN → boolean, DATE → ISO 8601 string, SELECT → one of the choices, MULTI_SELECT → array of choices. `null` or `""` leaves a cell empty.',
    type: 'object',
    additionalProperties: true,
    example: ROW_DATA_EXAMPLE,
  })
  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateRowDto {
  @ApiProperty({
    description:
      'Partial update: only the given keys change. Set a key to `null` to clear that cell.',
    type: 'object',
    additionalProperties: true,
    example: { status: 'Paused', seats: null },
  })
  @IsObject()
  @IsNotEmptyObject()
  data: Record<string, unknown>;
}

export const SORT_PATTERN = /^-?(createdAt|updatedAt|[a-z][a-z0-9_]{0,63})$/;

export class ListRowsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Full-text search across all cell values (substring, case-insensitive for ASCII).',
    example: 'acme',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description:
      'Sort by a column key, `createdAt` or `updatedAt`. Prefix with `-` for descending.',
    example: '-createdAt',
    default: 'createdAt',
  })
  @IsOptional()
  @Matches(SORT_PATTERN, { message: 'sort must be a column key, createdAt or updatedAt, optionally prefixed with -' })
  sort?: string;

  @ApiPropertyOptional({
    description: [
      'Per-column filters as `filter[<column key>][<operator>]=<value>`. `filter[<key>]=<value>` is shorthand for `eq`; repeat a parameter to add more conditions.',
      '',
      'Operators: `eq`, `neq`, `contains`, `ncontains`, `startsWith` (case-insensitive), `gt`, `gte`, `lt`, `lte` (numbers and dates), `in` (comma-separated list), `empty` (`true`/`false`).',
      '',
      'By type — TEXT/URL/EMAIL: eq, neq, contains, ncontains, startsWith, in, empty · LONG_TEXT: contains, ncontains, empty · NUMBER: eq, neq, gt, gte, lt, lte, in, empty · DATE: eq, neq, gt, gte, lt, lte, empty · BOOLEAN: eq · SELECT: eq, neq, in, empty · MULTI_SELECT: eq (contains option), neq (lacks option), in (has any of), empty.',
      '',
      '`createdAt` and `updatedAt` accept gt, gte, lt, lte with ISO 8601 values.',
      '',
      'Example: `filter[status][in]=Active,Paused&filter[seats][gte]=10&filter[renewal_date][lt]=2026-12-31`',
    ].join('\n'),
    type: 'object',
    additionalProperties: true,
    example: { status: { in: 'Active,Paused' }, seats: { gte: '10' } },
  })
  @IsOptional()
  @IsObject()
  filter?: RawFilter;

  @ApiPropertyOptional({
    description:
      'How filter conditions combine: `all` (AND, default) or `any` (OR). Search (`q`) always applies in addition.',
    enum: ['all', 'any'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'any'])
  match?: 'all' | 'any';
}

export class RowDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Cell values keyed by column key. Empty cells are omitted.',
    example: ROW_DATA_EXAMPLE,
  })
  data: Record<string, unknown>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PaginatedRowsDto {
  @ApiProperty({ type: [RowDto] })
  items: RowDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
