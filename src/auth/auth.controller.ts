import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { User } from '../generated/prisma/client.js';
import { UserDto } from '../users/dto/user.dto.js';
import { UsersService } from '../users/users.service.js';
import { AuthService, LoginRejectedError } from './auth.service.js';
import { AuthConfigDto } from './dto/auth-config.dto.js';
import { DevLoginDto } from './dto/dev-login.dto.js';
import { GoogleAuthGuard } from './google/google-auth.guard.js';
import type { OAuthRequest } from './google/google-auth.guard.js';
import type { GoogleProfile } from './google/google.strategy.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({
    summary: 'Sign-in options',
    description: 'Used by the login page to decide which buttons to show.',
  })
  @ApiOkResponse({ type: AuthConfigDto })
  authConfig(): AuthConfigDto {
    return {
      googleEnabled: this.config.isGoogleConfigured,
      devLoginEnabled: this.config.isDevLoginEnabled,
      allowedDomains: this.config.allowedEmailDomains,
    };
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiOperation({
    summary: 'Start Google sign-in',
    description: 'Redirects the browser to Google’s consent screen.',
  })
  @ApiFoundResponse({ description: 'Redirect to Google.' })
  @ApiServiceUnavailableResponse({
    description: 'Google OAuth credentials are not configured yet.',
  })
  googleLogin() {
    // Passport performs the redirect inside GoogleAuthGuard.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    const frontend = this.config.get('FRONTEND_URL');
    const fail = (reason: string) =>
      res.redirect(`${frontend}/login?error=${encodeURIComponent(reason)}`);

    if (req.oauthError || !req.user) return fail(req.oauthError ?? 'google_failed');

    try {
      const user = await this.auth.loginWithGoogle(
        req.user as unknown as GoogleProfile,
      );
      await this.auth.startSession(res, user);
      return res.redirect(`${frontend}/tables`);
    } catch (err) {
      if (err instanceof LoginRejectedError) return fail(err.reason);
      throw err;
    }
  }

  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Development sign-in (local only)',
    description:
      'Starts a session for an existing user without Google. Only available when NODE_ENV is not production and AUTH_DEV_LOGIN=true.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'User has not been invited.' })
  async devLogin(
    @Body() dto: DevLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.config.isDevLoginEnabled) throw new NotFoundException();
    try {
      const user = await this.auth.devLogin(dto.email);
      await this.auth.startSession(res, user);
      return this.users.get(user.id);
    } catch (err) {
      if (err instanceof LoginRejectedError) {
        throw new UnauthorizedException('That email has not been invited');
      }
      throw err;
    }
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current signed-in user' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: User) {
    return this.users.get(user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'End the current session' })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.endSession(res);
    await this.audit.record({
      action: 'auth.logout',
      entity: 'user',
      entityId: user.id,
    });
  }
}
