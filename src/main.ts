import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerModule,
  type SwaggerCustomOptions,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { AppConfigService } from './config/app-config.service.js';
import {
  API_TOKEN_AUTH,
} from './public-api/public-api.controller.js';
import { PublicApiModule } from './public-api/public-api.module.js';
import { SESSION_COOKIE } from './auth/auth.constants.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  // Caddy terminates TLS and forwards the client IP.
  app.set('trust proxy', 'loopback, uniquelocal');
  // Enables nested query params such as filter[status][eq]=Active.
  app.set('query parser', 'extended');

  app.use(requestContextMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Swagger UI needs inline styles and data: images.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: config.get('FRONTEND_URL'), credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );

  if (config.get('SWAGGER_ENABLED')) setupSwagger(app);

  await app.listen(config.get('PORT'));
}

function setupSwagger(app: NestExpressApplication) {
  const uiOptions: SwaggerCustomOptions = {
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  };

  const full = new DocumentBuilder()
    .setTitle('PartnerHero Records API')
    .setDescription(
      [
        'Internal records service (Airtable replacement).',
        '',
        '- **Admin endpoints** use the browser session cookie set by Google sign-in (or `POST /api/auth/dev-login` locally).',
        '- **Public API** (`/api/v1`) is read-only and uses `Authorization: Bearer <API token>`. Consumer-only docs: [/api/v1/docs](/api/v1/docs).',
        '',
        'All list endpoints are paginated with `page` / `pageSize` and return `{ items, meta }`. Every response carries an `X-Request-Id` header that also appears in logs and the audit trail.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'API token (phr_…)' },
      API_TOKEN_AUTH,
    )
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    () => SwaggerModule.createDocument(app, full),
    uiOptions,
  );

  const publicDoc = new DocumentBuilder()
    .setTitle('PartnerHero Records — Public API')
    .setDescription(
      'Read-only access to records tables for internal services. Request a token from a Records admin and send it as `Authorization: Bearer <token>`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'API token (phr_…)' },
      API_TOKEN_AUTH,
    )
    .build();
  SwaggerModule.setup(
    'api/v1/docs',
    app,
    () =>
      SwaggerModule.createDocument(app, publicDoc, {
        include: [PublicApiModule],
      }),
    uiOptions,
  );
}

await bootstrap();
