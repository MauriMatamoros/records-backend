import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto.js';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search by email or name.',
    example: 'jane',
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;
}

export class UserRefDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'admin@partnerhero.com' })
  email: string;
}

export class UserDto {
  @ApiProperty({ example: 'cm1x2y3z40000abcd1234efgh' })
  id: string;

  @ApiProperty({ example: 'jane@partnerhero.com' })
  email: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'Jane Doe' })
  name: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  avatarUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    type: UserRefDto,
    description: 'Who invited this user (null for the initial user).',
  })
  invitedBy: UserRefDto | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    type: Date,
    description: 'Null until the user signs in for the first time.',
  })
  lastLoginAt: Date | null;
}

export class PaginatedUsersDto {
  @ApiProperty({ type: [UserDto] })
  items: UserDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
