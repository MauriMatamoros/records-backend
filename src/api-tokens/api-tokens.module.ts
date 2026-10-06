import { Module } from '@nestjs/common';
import { ApiTokenGuard } from './api-token.guard.js';
import { ApiTokensController } from './api-tokens.controller.js';
import { ApiTokensService } from './api-tokens.service.js';

@Module({
  controllers: [ApiTokensController],
  providers: [ApiTokensService, ApiTokenGuard],
  exports: [ApiTokenGuard],
})
export class ApiTokensModule {}
