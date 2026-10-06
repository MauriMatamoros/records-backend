import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  @IsUrl({ require_tld: false })
  FRONTEND_URL = 'http://localhost:3000';

  @IsEnum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  SESSION_TTL_HOURS = 168;

  @IsString()
  @IsNotEmpty()
  ALLOWED_EMAIL_DOMAINS: string;

  @IsOptional()
  @IsString()
  INITIAL_USER_EMAIL?: string;

  @IsString()
  GOOGLE_CLIENT_ID = 'placeholder';

  @IsString()
  GOOGLE_CLIENT_SECRET = 'placeholder';

  @IsString()
  GOOGLE_CALLBACK_URL = 'http://localhost:3000/api/auth/google/callback';

  @Transform(toBoolean)
  @IsBoolean()
  AUTH_DEV_LOGIN = false;

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${messages}`);
  }
  return validated;
}
