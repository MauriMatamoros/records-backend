import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto, paginationMeta } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListRowsQueryDto, RowDto } from '../rows/dto/row.dto.js';
import { RowQueryService } from '../rows/row-query.service.js';
import { ColumnType } from '../tables/column-type.enum.js';
import { toRowDto, toTableDto } from '../tables/mappers.js';
import { TablesService } from '../tables/tables.service.js';

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tables: TablesService,
    private readonly rowQuery: RowQueryService,
  ) {}

  async listTables(query: PaginationQueryDto) {
    const [tables, total] = await this.prisma.$transaction([
      this.prisma.table.findMany({
        include: { columns: true },
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.table.count(),
    ]);
    return {
      items: tables.map(toTableDto),
      meta: paginationMeta(query.page, query.pageSize, total),
    };
  }

  getTable(slug: string) {
    return this.tables.getBySlug(slug);
  }

  async listRows(slug: string, query: ListRowsQueryDto) {
    return this.rowQuery.query(await this.tables.getBySlug(slug), query);
  }

  async getRow(slug: string, rowId: string): Promise<RowDto> {
    const table = await this.tables.getBySlug(slug);
    const row = await this.prisma.row.findFirst({
      where: { id: rowId, tableId: table.id },
    });
    if (!row) throw new NotFoundException('Row not found');
    return toRowDto(row);
  }

  async getRowByPrimaryKey(slug: string, value: string): Promise<RowDto> {
    const table = await this.tables.getBySlug(slug);
    const pk = table.columns.find((c) => c.primary);
    if (!pk) {
      throw new BadRequestException(
        `Table "${slug}" has no primary key column`,
      );
    }

    let bound: unknown = value;
    if (pk.type === ColumnType.NUMBER) {
      bound = Number(value);
      if (!Number.isFinite(bound)) {
        throw new BadRequestException('Primary key value must be a number');
      }
    } else if (pk.type === ColumnType.EMAIL) {
      bound = value.toLowerCase();
    }

    const [match] = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "Row" WHERE "tableId" = ? AND json_extract("data", ?) = ? LIMIT 1`,
      table.id,
      `$."${pk.key}"`,
      bound,
    );
    if (!match) {
      throw new NotFoundException(`No row with ${pk.key} = "${value}"`);
    }
    return toRowDto(
      await this.prisma.row.findUniqueOrThrow({ where: { id: match.id } }),
    );
  }
}
