import { Module } from '@nestjs/common';
import type { Request } from 'express';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ApiTokensModule } from './api-tokens/api-tokens.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicApiModule } from './public-api/public-api.module.js';
import { RowsModule } from './rows/rows.module.js';
import { TablesModule } from './tables/tables.module.js';
import { TransferModule } from './transfer/transfer.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // requestContextMiddleware (registered first in main.ts) assigns req.id.
          genReqId: (req) => (req as { id?: string }).id ?? randomUUID(),
          customProps: (req) => {
            const r = req as Request;
            return {
              actor: r.user
                ? { type: 'USER', id: r.user.id, email: r.user.email }
                : r.apiToken
                  ? {
                      type: 'API_TOKEN',
                      id: r.apiToken.id,
                      name: r.apiToken.name,
                      prefix: r.apiToken.prefix,
                    }
                  : undefined,
            };
          },
          customLogLevel: (_req, res, err) =>
            err || res.statusCode >= 500
              ? 'error'
              : res.statusCode >= 400
                ? 'warn'
                : 'info',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req) => req.url === '/api/health',
          },
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              },
        },
      }),
    }),
    PrismaModule,
    AuditModule,
    UsersModule,
    AuthModule,
    TablesModule,
    RowsModule,
    TransferModule,
    ApiTokensModule,
    PublicApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
