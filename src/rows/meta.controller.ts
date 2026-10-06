import { Controller, Get } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  CHOICE_TYPES,
  ColumnType,
  KEYABLE_TYPES,
} from '../tables/column-type.enum.js';
import { FILTER_OPERATORS, OPERATORS_BY_TYPE } from './row-filter.js';

class ColumnTypeInfoDto {
  @ApiProperty({ enum: ColumnType, enumName: 'ColumnType' })
  type: ColumnType;

  @ApiProperty({
    description: 'Filter operators supported for this type.',
    enum: FILTER_OPERATORS,
    isArray: true,
  })
  operators: string[];

  @ApiProperty({ description: 'Needs options.choices.' })
  hasChoices: boolean;

  @ApiProperty({ description: 'Can be unique or the primary key.' })
  keyable: boolean;
}

@ApiTags('Meta')
@ApiCookieAuth()
@Controller('meta')
export class MetaController {
  @Get('column-types')
  @ApiOperation({
    summary: 'Column types and their capabilities',
    description: 'Drives the column editor and filter builder in the UI.',
  })
  @ApiOkResponse({ type: [ColumnTypeInfoDto] })
  columnTypes(): ColumnTypeInfoDto[] {
    return Object.values(ColumnType).map((type) => ({
      type,
      operators: OPERATORS_BY_TYPE[type],
      hasChoices: CHOICE_TYPES.has(type),
      keyable: KEYABLE_TYPES.has(type),
    }));
  }
}
