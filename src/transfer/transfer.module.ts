import { Module } from '@nestjs/common';
import { RowsModule } from '../rows/rows.module.js';
import { TablesModule } from '../tables/tables.module.js';
import { TransferController } from './transfer.controller.js';
import { TransferService } from './transfer.service.js';

@Module({
  imports: [TablesModule, RowsModule],
  controllers: [TransferController],
  providers: [TransferService],
  exports: [TransferService],
})
export class TransferModule {}
