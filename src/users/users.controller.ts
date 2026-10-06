import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators.js';
import type { User } from '../generated/prisma/client.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
import {
  ListUsersQueryDto,
  PaginatedUsersDto,
  UserDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List everyone who can sign in' })
  @ApiOkResponse({ type: PaginatedUsersDto })
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Post('invite')
  @ApiOperation({
    summary: 'Invite a user',
    description:
      'Grants sign-in access to a company email. There is a single role: invited users can do everything, including inviting others.',
  })
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse({ description: 'Email domain is not allowed.' })
  @ApiConflictResponse({ description: 'User already exists.' })
  invite(@Body() dto: InviteUserDto, @CurrentUser() user: User) {
    return this.users.invite(dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a user',
    description: 'Revokes access immediately. You cannot remove yourself.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.users.remove(id, user);
  }
}
