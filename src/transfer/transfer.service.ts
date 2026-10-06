import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { parseJson } from '../common/json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RowData } from '../rows/row-data-validator.js';
import { RowQueryService } from '../rows/row-query.service.js';
import { KEYABLE_TYPES, ColumnType } from '../tables/column-type.enum.js';
import type { ColumnDto, CreateColumnDto } from '../tables/dto/column.dto.js';
import type { TableDto } from '../tables/dto/table.dto.js';
import { toColumnKey, toSlug } from '../tables/slugify.js';
import { TablesService } from '../tables/tables.service.js';
import { formatCell, inferColumn } from './cells.js';
import type {
  CreateTableFromFileDto,
  CreateTableFromFileResultDto,
  ExportQueryDto,
  ImportOptionsDto,
  ImportResultDto,
} from './dto/transfer.dto.js';
import { ImportPlan, planImport } from './import-planner.js';
import {
  CONTENT_TYPES,
  detectFormat,
  readSpreadsheet,
  SheetValue,
  SpreadsheetFormat,
  writeSpreadsheet,
} from './spreadsheet.js';

export const MAX_EXPORT_ROWS = 100_000;
const MAX_REPORTED_ERRORS = 200;
const WRITE_BATCH = 500;

export interface UploadedSheetFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface FileDownload {
  buffer: Buffer;
  filename: string;
  contentType: string;
  truncated: boolean;
}

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tables: TablesService,
    private readonly rowQuery: RowQueryService,
    private readonly audit: AuditService,
  ) {}

  async export(table: TableDto, query: ExportQueryDto): Promise<FileDownload> {
    const headers = exportHeaders(table.columns);
    const rows: SheetValue[][] = [];
    for await (const batch of this.rowQuery.selectAll(
      table,
      query,
      MAX_EXPORT_ROWS + 1,
    )) {
      for (const row of batch) {
        const data = parseJson<RowData>(row.data, {});
        rows.push(
          table.columns.map((c) => formatCell(c, data[c.key], query.format)),
        );
      }
    }
    const truncated = rows.length > MAX_EXPORT_ROWS;
    if (truncated) rows.length = MAX_EXPORT_ROWS;

    await this.audit.record({
      action: 'table.export',
      entity: 'table',
      entityId: table.id,
      detail: {
        slug: table.slug,
        format: query.format,
        rows: rows.length,
        truncated,
        q: query.q,
        filter: query.filter,
        sort: query.sort,
      },
    });
    return this.download(table, query.format, headers, rows, truncated);
  }

  /** Empty file whose headers match the table, for filling in and importing. */
  template(table: TableDto, format: SpreadsheetFormat): Promise<FileDownload> {
    return this.download(table, format, exportHeaders(table.columns), [], false, 'template');
  }

  async importIntoTable(
    tableId: string,
    file: UploadedSheetFile | undefined,
    options: ImportOptionsDto,
  ): Promise<ImportResultDto> {
    const table = await this.tables.get(tableId);
    const sheet = await readSpreadsheet(...this.fileInput(file));

    const { plan, committed } = await this.prisma.$transaction(
      async (tx) => {
        const existing = (
          await tx.row.findMany({
            where: { tableId },
            select: { id: true, data: true },
          })
        ).map((r) => ({ id: r.id, data: parseJson<RowData>(r.data, {}) }));

        const plan = planImport({
          sheet,
          columns: table.columns,
          mode: options.mode,
          existing,
        });
        const shouldWrite =
          !options.dryRun &&
          (plan.errors.length === 0 || options.skipInvalid) &&
          plan.creates.length + plan.updates.length > 0;

        if (shouldWrite) {
          for (let i = 0; i < plan.creates.length; i += WRITE_BATCH) {
            await tx.row.createMany({
              data: plan.creates.slice(i, i + WRITE_BATCH).map((data) => ({
                tableId,
                data: JSON.stringify(data),
              })),
            });
          }
          for (const update of plan.updates) {
            await tx.row.update({
              where: { id: update.id },
              data: { data: JSON.stringify(update.data) },
            });
          }
        }
        return { plan, committed: shouldWrite };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    const result = toResult(plan, sheet.rows.length, options.dryRun, committed);
    if (committed) {
      await this.audit.record({
        action: 'table.import',
        entity: 'table',
        entityId: tableId,
        detail: {
          file: file!.originalname,
          mode: options.mode,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          skippedInvalid: result.invalid,
        },
      });
    }
    return result;
  }

  async createTableFromFile(
    file: UploadedSheetFile | undefined,
    dto: CreateTableFromFileDto,
  ): Promise<CreateTableFromFileResultDto> {
    const [buffer, format] = this.fileInput(file);
    const sheet = await readSpreadsheet(buffer, format);
    const name =
      dto.name ?? file!.originalname.replace(/\.[^.]+$/, '').slice(0, 100);

    const columns = inferSchema(sheet.headers, sheet.rows, dto.primaryKey);
    const proposed: TableDto = {
      id: '',
      name,
      slug: toSlug(name),
      description: null,
      primaryKey: columns.find((c) => c.primary)?.key ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      columns: columns.map((c, order) => ({
        id: '',
        name: c.name,
        key: c.key!,
        type: c.type,
        options: c.options ?? {},
        order,
        required: !!c.primary,
        unique: !!c.primary,
        primary: !!c.primary,
      })),
    };

    const plan = planImport({
      sheet,
      columns: proposed.columns,
      mode: 'append',
      existing: [],
    });
    const report = toResult(plan, sheet.rows.length, true, false);

    if (dto.dryRun) return { ...report, table: proposed };
    if (plan.errors.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `${plan.errors.length} row(s) have errors; nothing was created. Fix the file or choose a different primary key.`,
        ...report,
        table: proposed,
      });
    }

    const table = await this.tables.create({
      name,
      columns,
      description: `Imported from ${file!.originalname}`,
    });
    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (let i = 0; i < plan.creates.length; i += WRITE_BATCH) {
            await tx.row.createMany({
              data: plan.creates.slice(i, i + WRITE_BATCH).map((data) => ({
                tableId: table.id,
                data: JSON.stringify(data),
              })),
            });
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (err) {
      await this.prisma.table.delete({ where: { id: table.id } });
      throw err;
    }

    await this.audit.record({
      action: 'table.import',
      entity: 'table',
      entityId: table.id,
      detail: {
        file: file!.originalname,
        mode: 'create',
        created: plan.creates.length,
        columns: columns.map((c) => `${c.key}:${c.type}`),
      },
    });
    return {
      ...toResult(plan, sheet.rows.length, false, true),
      table: await this.tables.get(table.id),
    };
  }

  private fileInput(
    file: UploadedSheetFile | undefined,
  ): [Buffer, SpreadsheetFormat] {
    if (!file) {
      throw new BadRequestException('Attach a .csv or .xlsx file as "file"');
    }
    return [file.buffer, detectFormat(file.originalname)];
  }

  private async download(
    table: TableDto,
    format: SpreadsheetFormat,
    headers: string[],
    rows: SheetValue[][],
    truncated: boolean,
    suffix = new Date().toISOString().slice(0, 10),
  ): Promise<FileDownload> {
    return {
      buffer: await writeSpreadsheet(format, table.name, headers, rows),
      filename: `${table.slug}-${suffix}.${format}`,
      contentType: CONTENT_TYPES[format],
      truncated,
    };
  }
}

/** Column names as headers; duplicates get their key appended so imports can map them back. */
function exportHeaders(columns: ColumnDto[]): string[] {
  const counts = new Map<string, number>();
  for (const c of columns) {
    const n = c.name.trim().toLowerCase();
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return columns.map((c) =>
    counts.get(c.name.trim().toLowerCase())! > 1 ? `${c.name} (${c.key})` : c.name,
  );
}

function inferSchema(
  headers: string[],
  rows: SheetValue[][],
  primaryKey: string | undefined,
): CreateColumnDto[] {
  const usedKeys = new Set<string>();
  const usedNames = new Set<string>();
  const pkHeader = primaryKey?.trim().toLowerCase();
  let pkFound = false;

  const columns = headers.flatMap((header, i): CreateColumnDto[] => {
    if (header === '') return [];
    let name = header.slice(0, 100);
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) {
      name = `${header.slice(0, 95)} ${n}`;
    }
    usedNames.add(name.toLowerCase());

    let key = toColumnKey(name);
    for (let n = 2; usedKeys.has(key); n++) key = `${toColumnKey(name)}_${n}`;
    usedKeys.add(key);

    const inferred = inferColumn(rows.map((r) => r[i] ?? null));
    const primary = pkHeader !== undefined && header.toLowerCase() === pkHeader;
    if (primary) pkFound = true;
    const type =
      primary && !KEYABLE_TYPES.has(inferred.type)
        ? ColumnType.TEXT
        : inferred.type;

    return [
      {
        name,
        key,
        type,
        primary: primary || undefined,
        options:
          type === ColumnType.SELECT ? { choices: inferred.choices } : undefined,
      },
    ];
  });

  if (pkHeader !== undefined && !pkFound) {
    throw new BadRequestException(
      `Primary key column "${primaryKey}" is not among the file's headers`,
    );
  }
  if (columns.length > 100) {
    throw new BadRequestException('Files are limited to 100 columns');
  }
  return columns;
}

function toResult(
  plan: ImportPlan,
  totalRows: number,
  dryRun: boolean,
  committed: boolean,
): ImportResultDto {
  return {
    dryRun,
    committed,
    totalRows,
    created: plan.creates.length,
    updated: plan.updates.length,
    unchanged: plan.unchanged,
    invalid: plan.errors.length,
    mappedColumns: plan.mappedColumns,
    ignoredHeaders: plan.ignoredHeaders,
    errors: plan.errors.slice(0, MAX_REPORTED_ERRORS),
  };
}
