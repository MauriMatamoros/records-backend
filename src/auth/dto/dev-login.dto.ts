import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({
    description: 'Email of an existing (invited) user to sign in as.',
    example: 'admin@partnerhero.com',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;
}
