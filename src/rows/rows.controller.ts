import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateRowDto,
  ListRowsQueryDto,
  PaginatedRowsDto,
  RowDto,
  UpdateRowDto,
} from './dto/row.dto.js';
import { RowsService } from './rows.service.js';

const INVALID_DATA = {
  description:
    'Row data failed validation. `fields` maps each offending column key to an error message.',
  schema: {
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Row data is invalid',
      fields: { seats: 'Must be a number', status: 'Required' },
    },
  },
};

const UNIQUE_VIOLATION = {
  description:
    'A unique or primary-key column value already exists in another row.',
  schema: {
    example: {
      statusCode: 409,
      error: 'Conflict',
      message: 'Row violates a uniqueness constraint',
      fields: { account_id: 'Primary key "ACME-001" already exists' },
    },
  },
};

@ApiTags('Rows')
@ApiCookieAuth()
@Controller('tables/:tableId/rows')
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Get()
  @ApiOperation({ summary: 'List rows (search, filter, sort, paginate)' })
  @ApiOkResponse({ type: PaginatedRowsDto })
  @ApiNotFoundResponse({ description: 'Table not found.' })
  list(@Param('tableId') tableId: string, @Query() query: ListRowsQueryDto) {
    return this.rows.list(tableId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a row' })
  @ApiCreatedResponse({ type: RowDto })
  @ApiBadRequestResponse(INVALID_DATA)
  @ApiConflictResponse(UNIQUE_VIOLATION)
  create(@Param('tableId') tableId: string, @Body() dto: CreateRowDto) {
    return this.rows.create(tableId, dto);
  }

  @Get(':rowId')
  @ApiOperation({ summary: 'Get a row' })
  @ApiOkResponse({ type: RowDto })
  @ApiNotFoundResponse()
  get(@Param('tableId') tableId: string, @Param('rowId') rowId: string) {
    return this.rows.get(tableId, rowId);
  }

  @Patch(':rowId')
  @ApiOperation({
    summary: 'Update cells of a row',
    description: 'Only the provided keys change; `null` clears a cell.',
  })
  @ApiOkResponse({ type: RowDto })
  @ApiBadRequestResponse(INVALID_DATA)
  @ApiConflictResponse(UNIQUE_VIOLATION)
  @ApiNotFoundResponse()
  update(
    @Param('tableId') tableId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateRowDto,
  ) {
    return this.rows.update(tableId, rowId, dto);
  }

  @Delete(':rowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a row' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('tableId') tableId: string, @Param('rowId') rowId: string) {
    return this.rows.remove(tableId, rowId);
  }
}
