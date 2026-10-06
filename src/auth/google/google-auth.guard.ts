import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import { OAUTH_STATE_COOKIE } from '../auth.constants.js';

export type OAuthRequest = Request & { oauthError?: string };

/**
 * Wraps passport's Google flow with a cookie-bound `state` nonce (CSRF
 * protection without server sessions). Failures are recorded on the request
 * instead of thrown so the callback can redirect back to the login page.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.isGoogleConfigured) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are placeholders).',
      );
    }

    const req = context.switchToHttp().getRequest<OAuthRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const isCallback = 'code' in req.query || 'error' in req.query;

    if (isCallback) {
      const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
      const received = typeof req.query.state === 'string' ? req.query.state : '';
      res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/google' });
      if (!expected || !safeEqual(expected, received)) {
        req.oauthError = 'state_mismatch';
        return true;
      }
      if ('error' in req.query) {
        req.oauthError = 'google_denied';
        return true;
      }
    }

    return (await super.canActivate(context)) as boolean;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if ('code' in req.query) return {};

    const state = randomBytes(24).toString('base64url');
    context
      .switchToHttp()
      .getResponse<Response>()
      .cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.isProduction,
        path: '/api/auth/google',
        maxAge: 10 * 60 * 1000,
      });
    return { state, prompt: 'select_account' };
  }

  handleRequest<TUser>(err: unknown, user: TUser, _info: unknown, context: ExecutionContext): TUser {
    if (err || !user) {
      context.switchToHttp().getRequest<OAuthRequest>().oauthError =
        'google_failed';
    }
    return user;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
