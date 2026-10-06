import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination.dto.js';

export class AuditLogDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ enum: ['USER', 'API_TOKEN', 'SYSTEM'], example: 'USER' })
  actorType: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  actorId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Email for users, token name for API tokens.',
    example: 'jane@partnerhero.com',
  })
  actorLabel: string | null;

  @ApiProperty({ example: 'row.update' })
  action: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'row' })
  entity: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  entityId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Action-specific details, e.g. a before/after diff.',
    example: { changes: { status: { from: 'open', to: 'closed' } } },
  })
  detail: unknown;

  @ApiPropertyOptional({ nullable: true, type: String, example: '10.0.0.4' })
  ip: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Correlates with the X-Request-Id header and request logs.',
  })
  requestId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedAuditLogsDto {
  @ApiProperty({ type: [AuditLogDto] })
  items: AuditLogDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
