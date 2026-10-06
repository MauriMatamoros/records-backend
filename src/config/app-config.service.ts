import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from './env.validation.js';

/** Typed accessors over validated environment variables. */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === NodeEnv.Production;
  }

  get allowedEmailDomains(): string[] {
    return this.get('ALLOWED_EMAIL_DOMAINS')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }

  isAllowedEmail(email: string): boolean {
    const domain = email.split('@').pop()?.toLowerCase() ?? '';
    return this.allowedEmailDomains.includes(domain);
  }

  get isGoogleConfigured(): boolean {
    const id = this.get('GOOGLE_CLIENT_ID');
    const secret = this.get('GOOGLE_CLIENT_SECRET');
    return !!id && !!secret && id !== 'placeholder' && secret !== 'placeholder';
  }

  get isDevLoginEnabled(): boolean {
    return !this.isProduction && this.get('AUTH_DEV_LOGIN');
  }
}
