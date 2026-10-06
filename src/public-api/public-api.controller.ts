import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { Public } from '../common/decorators.js';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto.js';
import {
  ListRowsQueryDto,
  PaginatedRowsDto,
  RowDto,
} from '../rows/dto/row.dto.js';
import { TableDto } from '../tables/dto/table.dto.js';
import { ExportQueryDto } from '../transfer/dto/transfer.dto.js';
import { sendFile } from '../transfer/transfer.controller.js';
import { TransferService } from '../transfer/transfer.service.js';
import { ApiReadAuditInterceptor } from './api-read-audit.interceptor.js';
import { PublicApiService } from './public-api.service.js';

export const API_TOKEN_AUTH = 'api-token';

class PaginatedPublicTablesDto {
  @ApiProperty({ type: [TableDto] })
  items: TableDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

const SLUG = {
  name: 'slug',
  description: 'Table slug, e.g. `client-accounts`.',
  example: 'client-accounts',
};

/**
 * Read-only API for internal services. Authenticated with API tokens rather
 * than the browser session, so it opts out of the global session guard.
 */
@ApiTags('Public API (v1)')
@ApiBearerAuth(API_TOKEN_AUTH)
@ApiUnauthorizedResponse({ description: 'Missing, invalid or revoked token.' })
@Public()
@UseGuards(ApiTokenGuard)
@UseInterceptors(ApiReadAuditInterceptor)
@Controller('v1/tables')
export class PublicApiController {
  constructor(
    private readonly api: PublicApiService,
    private readonly transfer: TransferService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List tables',
    description: 'Every table with its column schema, sorted by name.',
  })
  @ApiOkResponse({ type: PaginatedPublicTablesDto })
  listTables(@Query() query: PaginationQueryDto) {
    return this.api.listTables(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a table schema' })
  @ApiParam(SLUG)
  @ApiOkResponse({ type: TableDto })
  @ApiNotFoundResponse()
  getTable(@Param('slug') slug: string) {
    return this.api.getTable(slug);
  }

  @Get(':slug/rows')
  @ApiOperation({
    summary: 'Query rows',
    description:
      'Search, filter, sort and paginate rows. See the `filter` parameter for the operator syntax.',
  })
  @ApiParam(SLUG)
  @ApiOkResponse({ type: PaginatedRowsDto })
  @ApiBadRequestResponse({ description: 'Invalid filter or sort.' })
  @ApiNotFoundResponse()
  listRows(@Param('slug') slug: string, @Query() query: ListRowsQueryDto) {
    return this.api.listRows(slug, query);
  }

  @Get(':slug/export')
  @ApiOperation({
    summary: 'Export rows to CSV/Excel',
    description:
      'Same `q`, `filter`, `match` and `sort` parameters as the rows query; `format=csv|xlsx`. Up to 100,000 rows (`X-Export-Truncated: true` when there were more).',
  })
  @ApiParam(SLUG)
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ description: 'The file.' })
  @ApiNotFoundResponse()
  async export(
    @Param('slug') slug: string,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.api.getTable(slug);
    return sendFile(res, await this.transfer.export(table, query));
  }

  @Get(':slug/rows/by-key/:value')
  @ApiOperation({
    summary: 'Get a row by primary key',
    description:
      'Looks the row up by the value of the table’s primary-key column.',
  })
  @ApiParam(SLUG)
  @ApiParam({ name: 'value', example: 'ACME-001' })
  @ApiOkResponse({ type: RowDto })
  @ApiBadRequestResponse({ description: 'Table has no primary key.' })
  @ApiNotFoundResponse()
  getRowByKey(@Param('slug') slug: string, @Param('value') value: string) {
    return this.api.getRowByPrimaryKey(slug, value);
  }

  @Get(':slug/rows/:rowId')
  @ApiOperation({ summary: 'Get a row by id' })
  @ApiParam(SLUG)
  @ApiOkResponse({ type: RowDto })
  @ApiNotFoundResponse()
  getRow(@Param('slug') slug: string, @Param('rowId') rowId: string) {
    return this.api.getRow(slug, rowId);
  }
}
