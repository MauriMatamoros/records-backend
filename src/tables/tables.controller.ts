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
  Put,
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
import { ColumnsService } from './columns.service.js';
import {
  ColumnDto,
  CreateColumnDto,
  ReorderColumnsDto,
  UpdateColumnDto,
} from './dto/column.dto.js';
import {
  CreateTableDto,
  ListTablesQueryDto,
  PaginatedTablesDto,
  TableDto,
  UpdateTableDto,
} from './dto/table.dto.js';
import { TablesService } from './tables.service.js';

@ApiTags('Tables')
@ApiCookieAuth()
@Controller('tables')
export class TablesController {
  constructor(
    private readonly tables: TablesService,
    private readonly columns: ColumnsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tables', description: 'Sorted by name.' })
  @ApiOkResponse({ type: PaginatedTablesDto })
  list(@Query() query: ListTablesQueryDto) {
    return this.tables.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a table',
    description: 'Optionally include its initial columns.',
  })
  @ApiCreatedResponse({ type: TableDto })
  @ApiConflictResponse({ description: 'Slug already in use.' })
  create(@Body() dto: CreateTableDto) {
    return this.tables.create(dto);
  }

  @Get(':tableId')
  @ApiOperation({ summary: 'Get a table with its column definitions' })
  @ApiOkResponse({ type: TableDto })
  @ApiNotFoundResponse()
  get(@Param('tableId') tableId: string) {
    return this.tables.get(tableId);
  }

  @Patch(':tableId')
  @ApiOperation({ summary: 'Rename or re-describe a table' })
  @ApiOkResponse({ type: TableDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Slug already in use.' })
  update(@Param('tableId') tableId: string, @Body() dto: UpdateTableDto) {
    return this.tables.update(tableId, dto);
  }

  @Delete(':tableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a table',
    description: 'Permanently deletes the table, its columns and all rows.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('tableId') tableId: string) {
    return this.tables.remove(tableId);
  }

  @Post(':tableId/columns')
  @ApiOperation({
    summary: 'Add a column',
    description: 'Appended after the last column.',
  })
  @ApiCreatedResponse({ type: ColumnDto })
  @ApiBadRequestResponse({ description: 'Missing choices for a select type.' })
  @ApiConflictResponse({ description: 'Column key already exists.' })
  addColumn(@Param('tableId') tableId: string, @Body() dto: CreateColumnDto) {
    return this.columns.add(tableId, dto);
  }

  @Put(':tableId/columns/order')
  @ApiOperation({ summary: 'Reorder columns' })
  @ApiOkResponse({ type: [ColumnDto] })
  reorderColumns(
    @Param('tableId') tableId: string,
    @Body() dto: ReorderColumnsDto,
  ) {
    return this.columns.reorder(tableId, dto);
  }

  @Patch(':tableId/columns/:columnId')
  @ApiOperation({
    summary: 'Update a column',
    description:
      'The key is immutable. Changing the type does not convert existing values; they are re-validated the next time each cell is edited.',
  })
  @ApiOkResponse({ type: ColumnDto })
  @ApiNotFoundResponse()
  updateColumn(
    @Param('tableId') tableId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columns.update(tableId, columnId, dto);
  }

  @Delete(':tableId/columns/:columnId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a column',
    description: 'Also removes the column’s value from every row.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removeColumn(
    @Param('tableId') tableId: string,
    @Param('columnId') columnId: string,
  ) {
    return this.columns.remove(tableId, columnId);
  }
}
