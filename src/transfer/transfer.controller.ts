import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { TablesService } from '../tables/tables.service.js';
import {
  CreateTableFromFileDto,
  CreateTableFromFileResultDto,
  ExportQueryDto,
  FILE_UPLOAD_SCHEMA,
  ImportOptionsDto,
  ImportResultDto,
  TemplateQueryDto,
} from './dto/transfer.dto.js';
import { MAX_IMPORT_BYTES } from './spreadsheet.js';
import {
  FileDownload,
  TransferService,
  type UploadedSheetFile,
} from './transfer.service.js';

export const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

export function sendFile(res: Response, file: FileDownload): StreamableFile {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  );
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Truncated');
  if (file.truncated) res.setHeader('X-Export-Truncated', 'true');
  return new StreamableFile(file.buffer);
}

@ApiTags('Import / export')
@ApiCookieAuth()
@Controller('tables')
export class TransferController {
  constructor(
    private readonly transfer: TransferService,
    private readonly tables: TablesService,
  ) {}

  @Post('import')
  @UseInterceptors(UPLOAD)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a table from a CSV/Excel file',
    description:
      'Headers become columns; types (number, date, boolean, email, URL, single select, text) are inferred from the values. Use `dryRun=true` to preview the inferred schema and validation report first. Any row error aborts creation.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(
    FILE_UPLOAD_SCHEMA({
      name: { type: 'string', description: 'Table name (defaults to the file name).' },
      primaryKey: { type: 'string', description: 'Header to use as primary key.' },
      dryRun: { type: 'boolean', default: false },
    }),
  )
  @ApiCreatedResponse({ type: CreateTableFromFileResultDto })
  @ApiBadRequestResponse({
    description: 'Unreadable file, or rows failed validation (the body includes the full report).',
  })
  createFromFile(
    @UploadedFile() file: UploadedSheetFile | undefined,
    @Body() dto: CreateTableFromFileDto,
  ) {
    return this.transfer.createTableFromFile(file, dto);
  }

  @Post(':tableId/import')
  @UseInterceptors(UPLOAD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import rows from a CSV/Excel file',
    description: [
      'Headers are matched to columns by name or key (case-insensitive); unmatched headers are reported and ignored.',
      'Every row is validated with the same rules as the API (types, required, unique, primary key — including duplicates within the file).',
      'The import is all-or-nothing unless `skipInvalid=true`. Run with `dryRun=true` to preview.',
    ].join('\n\n'),
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(
    FILE_UPLOAD_SCHEMA({
      mode: { type: 'string', enum: ['append', 'upsert'], default: 'append' },
      dryRun: { type: 'boolean', default: false },
      skipInvalid: { type: 'boolean', default: false },
    }),
  )
  @ApiOkResponse({ type: ImportResultDto })
  importRows(
    @Param('tableId') tableId: string,
    @UploadedFile() file: UploadedSheetFile | undefined,
    @Body() options: ImportOptionsDto,
  ) {
    return this.transfer.importIntoTable(tableId, file, options);
  }

  @Get(':tableId/export')
  @ApiOperation({
    summary: 'Export rows to CSV/Excel',
    description: `Accepts the same \`q\`, \`filter\`, \`match\` and \`sort\` parameters as the rows listing. Up to 100,000 rows; the \`X-Export-Truncated: true\` header is set when there were more.`,
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'The file.' })
  async export(
    @Param('tableId') tableId: string,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.tables.get(tableId);
    return sendFile(res, await this.transfer.export(table, query));
  }

  @Get(':tableId/import-template')
  @ApiOperation({
    summary: 'Download an empty import template',
    description: 'A file whose header row matches the table’s columns.',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'The file.' })
  async template(
    @Param('tableId') tableId: string,
    @Query() query: TemplateQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const table = await this.tables.get(tableId);
    return sendFile(res, await this.transfer.template(table, query.format));
  }
}
