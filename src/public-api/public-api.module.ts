import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module.js';
import { RowsModule } from '../rows/rows.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { TransferModule } from '../transfer/transfer.module.js';
import { ApiReadAuditInterceptor } from './api-read-audit.interceptor.js';
import { PublicApiController } from './public-api.controller.js';
import { PublicApiService } from './public-api.service.js';

@Module({
  imports: [ApiTokensModule, TablesModule, RowsModule, TransferModule],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiReadAuditInterceptor],
})
export class PublicApiModule {}
