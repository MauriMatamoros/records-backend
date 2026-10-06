import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaBetterSqlite3({ url: config.get('DATABASE_URL') }),
    });
  }

  async onModuleInit() {
    await this.$connect();
    // WAL lets the public API keep reading while the admin UI writes.
    await this.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await this.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
