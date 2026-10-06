import { Module } from '@nestjs/common';
import { TablesModule } from '../tables/tables.module.js';
import { MetaController } from './meta.controller.js';
import { RowQueryService } from './row-query.service.js';
import { RowsController } from './rows.controller.js';
import { RowsService } from './rows.service.js';

@Module({
  imports: [TablesModule],
  controllers: [RowsController, MetaController],
  providers: [RowsService, RowQueryService],
  exports: [RowQueryService],
})
export class RowsModule {}
