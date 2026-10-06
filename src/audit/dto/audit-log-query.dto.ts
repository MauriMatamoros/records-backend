import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Exact action (e.g. `row.update`), or a prefix ending in a dot (e.g. `row.`) to match a whole category.',
    example: 'row.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({
    description: 'Kind of actor that performed the action.',
    enum: ['USER', 'API_TOKEN', 'SYSTEM'],
  })
  @IsOptional()
  @IsIn(['USER', 'API_TOKEN', 'SYSTEM'])
  actorType?: string;

  @ApiPropertyOptional({
    description: 'Substring match on the actor email or token name.',
    example: 'jane@',
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  actor?: string;

  @ApiPropertyOptional({
    description: 'Only entries about this entity id (table, row, user, …).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound (ISO 8601).',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound (ISO 8601).',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
