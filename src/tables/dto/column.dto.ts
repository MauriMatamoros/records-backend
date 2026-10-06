import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { COLUMN_KEY_PATTERN, ColumnType } from '../column-type.enum.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ColumnOptionsDto {
  @ApiPropertyOptional({
    description:
      'Allowed values. Required (non-empty) for SELECT and MULTI_SELECT columns; ignored otherwise.',
    example: ['Active', 'Paused', 'Churned'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  choices?: string[];
}

export class CreateColumnDto {
  @ApiProperty({
    description: 'Display name shown as the column header.',
    example: 'Account Status',
    maxLength: 100,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description:
      'Stable machine key used in row `data` objects and the public API. Lowercase letters, digits and underscores; must start with a letter. Generated from `name` when omitted. Cannot be changed later.',
    example: 'account_status',
    pattern: COLUMN_KEY_PATTERN.source,
  })
  @IsOptional()
  @Matches(COLUMN_KEY_PATTERN, {
    message:
      'key must be lowercase letters, digits or underscores and start with a letter (max 64 chars)',
  })
  key?: string;

  @ApiProperty({
    description: 'Data type; controls validation of cell values.',
    enum: ColumnType,
    enumName: 'ColumnType',
    example: ColumnType.SELECT,
  })
  @IsEnum(ColumnType)
  type: ColumnType;

  @ApiPropertyOptional({
    description: 'Whether every row must have a value for this column.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description:
      'Whether values must be distinct across rows (empty cells are ignored). Only for TEXT, NUMBER, DATE, URL and EMAIL columns. Enabling it fails with 409 if existing rows already contain duplicates.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @ApiPropertyOptional({
    description:
      'Make this the table’s primary key: implies `required` and `unique`, and lets the public API look rows up by this value. A table has at most one primary key; setting it moves the flag from the previous column. Only for TEXT, NUMBER, DATE, URL and EMAIL columns.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  primary?: boolean;

  @ApiPropertyOptional({ type: ColumnOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnOptionsDto)
  options?: ColumnOptionsDto;
}

export class UpdateColumnDto extends PartialType(
  OmitType(CreateColumnDto, ['key'] as const),
) {}

export class ReorderColumnsDto {
  @ApiProperty({
    description:
      'Every column id of the table, in the desired display order.',
    example: ['cm1colA', 'cm1colC', 'cm1colB'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  columnIds: string[];
}

export class ColumnDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'Account Status' })
  name: string;

  @ApiProperty({ example: 'account_status' })
  key: string;

  @ApiProperty({ enum: ColumnType, enumName: 'ColumnType' })
  type: ColumnType;

  @ApiProperty({ type: ColumnOptionsDto })
  options: ColumnOptionsDto;

  @ApiProperty({ description: 'Zero-based display position.', example: 0 })
  order: number;

  @ApiProperty({ example: false })
  required: boolean;

  @ApiProperty({ example: false })
  unique: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether this is the table’s primary key.',
  })
  primary: boolean;
}
