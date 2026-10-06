import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { AppConfigService } from '../../config/app-config.service.js';

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

/**
 * Registered even while credentials are placeholders so the app boots;
 * GoogleAuthGuard short-circuits with 503 until real secrets are configured.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: AppConfigService) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID'),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.get('GOOGLE_CALLBACK_URL'),
      scope: ['openid', 'email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleProfile {
    const primary = profile.emails?.[0];
    return {
      email: (primary?.value ?? '').toLowerCase(),
      emailVerified: primary?.verified === true,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };
  }
}
