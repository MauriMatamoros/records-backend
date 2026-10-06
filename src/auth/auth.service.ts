import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_COOKIE, SessionPayload } from './auth.constants.js';
import type { GoogleProfile } from './google/google.strategy.js';

export type LoginRejection =
  | 'email_unverified'
  | 'domain_not_allowed'
  | 'not_invited';

export class LoginRejectedError extends Error {
  constructor(readonly reason: LoginRejection) {
    super(reason);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sign-in requires both a company-domain email and a prior invitation
   * (an existing User row). Every attempt is audited.
   */
  async loginWithGoogle(profile: GoogleProfile): Promise<User> {
    const reject = async (reason: LoginRejection): Promise<never> => {
      await this.audit.record({
        action: 'auth.login_rejected',
        actor: { type: 'USER', label: profile.email },
        detail: { reason, provider: 'google' },
      });
      throw new LoginRejectedError(reason);
    };

    if (!profile.emailVerified) return reject('email_unverified');
    if (!this.config.isAllowedEmail(profile.email))
      return reject('domain_not_allowed');

    const existing = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });
    if (!existing) return reject('not_invited');

    const user = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        lastLoginAt: new Date(),
        name: existing.name ?? profile.name,
        avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
      },
    });
    await this.recordLogin(user, 'google');
    return user;
  }

  /** Local-development shortcut; the controller only exposes it outside production. */
  async devLogin(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      await this.audit.record({
        action: 'auth.login_rejected',
        actor: { type: 'USER', label: email },
        detail: { reason: 'not_invited', provider: 'dev' },
      });
      throw new LoginRejectedError('not_invited');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.recordLogin(updated, 'dev');
    return updated;
  }

  async startSession(res: Response, user: User): Promise<void> {
    const payload: SessionPayload = { sub: user.id, email: user.email };
    const token = await this.jwt.signAsync(payload);
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get('SESSION_TTL_HOURS') * 60 * 60 * 1000,
    });
  }

  endSession(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: '/',
    };
  }

  private recordLogin(user: User, provider: 'google' | 'dev') {
    return this.audit.record({
      action: 'auth.login',
      actor: { type: 'USER', id: user.id, label: user.email },
      entity: 'user',
      entityId: user.id,
      detail: { provider },
    });
  }
}
