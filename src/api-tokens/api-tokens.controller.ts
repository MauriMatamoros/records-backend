import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators.js';
import type { User } from '../generated/prisma/client.js';
import { ApiTokensService } from './api-tokens.service.js';
import {
  ApiTokenDto,
  CreateApiTokenDto,
  CreatedApiTokenDto,
  ListApiTokensQueryDto,
  PaginatedApiTokensDto,
} from './dto/api-token.dto.js';

@ApiTags('API tokens')
@ApiCookieAuth()
@Controller('tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensService) {}

  @Get()
  @ApiOperation({ summary: 'List API tokens', description: 'Newest first.' })
  @ApiOkResponse({ type: PaginatedApiTokensDto })
  list(@Query() query: ListApiTokensQueryDto) {
    return this.tokens.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API token',
    description:
      'Creates a read-only token for the public API (`/api/v1`). The secret is in the response once and never again.',
  })
  @ApiCreatedResponse({ type: CreatedApiTokenDto })
  create(@Body() dto: CreateApiTokenDto, @CurrentUser() user: User) {
    return this.tokens.create(dto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Revoke an API token',
    description:
      'Takes effect immediately. The record is kept (with `revokedAt`) for the audit trail.',
  })
  @ApiOkResponse({ type: ApiTokenDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Already revoked.' })
  revoke(@Param('id') id: string) {
    return this.tokens.revoke(id);
  }
}
