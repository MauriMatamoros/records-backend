import { ApiProperty } from '@nestjs/swagger';

export class AuthConfigDto {
  @ApiProperty({
    description: 'Whether real Google OAuth credentials are configured.',
    example: false,
  })
  googleEnabled: boolean;

  @ApiProperty({
    description: 'Whether the local dev-login shortcut is available.',
    example: true,
  })
  devLoginEnabled: boolean;

  @ApiProperty({
    description: 'Email domains allowed to sign in.',
    example: ['partnerhero.com'],
  })
  allowedDomains: string[];
}
