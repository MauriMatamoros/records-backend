import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';
import { UserRefDto } from '../../users/dto/user.dto.js';

export class CreateApiTokenDto {
  @ApiProperty({
    description:
      'Label identifying the consuming service. Shown in the audit log for every request made with this token.',
    example: 'billing-service',
    maxLength: 80,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class ListApiTokensQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Include revoked tokens.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeRevoked?: boolean;
}

export class ApiTokenDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'billing-service' })
  name: string;

  @ApiProperty({
    description: 'First characters of the token, for identification.',
    example: 'phr_Ab12Cd34',
  })
  prefix: string;

  @ApiPropertyOptional({ nullable: true, type: UserRefDto })
  createdBy: UserRefDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true, type: Date })
  lastUsedAt: Date | null;

  @ApiPropertyOptional({ nullable: true, type: Date })
  revokedAt: Date | null;
}

export class CreatedApiTokenDto extends ApiTokenDto {
  @ApiProperty({
    description:
      'The full secret. Returned only once — store it securely; it cannot be retrieved again.',
    example: 'phr_Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv1',
  })
  token: string;
}

export class PaginatedApiTokensDto {
  @ApiProperty({ type: [ApiTokenDto] })
  @Type(() => ApiTokenDto)
  items: ApiTokenDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
