import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service.js';
import { AuditLogQueryDto } from './dto/audit-log-query.dto.js';
import { PaginatedAuditLogsDto } from './dto/audit-log.dto.js';

@ApiTags('Audit log')
@ApiCookieAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'List audit log entries',
    description:
      'Newest first. Every mutation, sign-in attempt and public-API read is recorded.',
  })
  @ApiOkResponse({ type: PaginatedAuditLogsDto })
  list(@Query() query: AuditLogQueryDto) {
    return this.audit.list(query);
  }
}
