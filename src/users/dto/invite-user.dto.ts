import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteUserDto {
  @ApiProperty({
    description:
      'Company email of the person to invite. Must belong to an allowed domain. Once invited they can sign in with Google.',
    example: 'jane@partnerhero.com',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({
    description:
      'Display name. Optional; filled from the Google profile on first sign-in.',
    example: 'Jane Doe',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  name?: string;
}
