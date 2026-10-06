import { Module } from '@nestjs/common';
import { ColumnsService } from './columns.service.js';
import { TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

@Module({
  controllers: [TablesController],
  providers: [TablesService, ColumnsService],
  exports: [TablesService],
})
export class TablesModule {}
