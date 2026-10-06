import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppConfigService } from '../config/app-config.service.js';
import { paginationMeta } from '../common/dto/pagination.dto.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
import {
  ListUsersQueryDto,
  PaginatedUsersDto,
  UserDto,
} from './dto/user.dto.js';

const withInviter = {
  invitedBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Creates INITIAL_USER_EMAIL when the user table is empty (first deploy). */
  async onApplicationBootstrap() {
    const email = this.config.get('INITIAL_USER_EMAIL')?.trim().toLowerCase();
    if (!email) return;
    if ((await this.prisma.user.count()) > 0) return;

    const user = await this.prisma.user.create({ data: { email } });
    this.logger.log(`Created initial user ${email}`);
    await this.audit.record({
      action: 'user.bootstrap',
      actor: { type: 'SYSTEM', label: 'bootstrap' },
      entity: 'user',
      entityId: user.id,
      detail: { email },
    });
  }

  async list(query: ListUsersQueryDto): Promise<PaginatedUsersDto> {
    const where: Prisma.UserWhereInput = query.q
      ? { OR: [{ email: { contains: query.q } }, { name: { contains: query.q } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: withInviter,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: withInviter,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async invite(dto: InviteUserDto, inviter: User): Promise<UserDto> {
    if (!this.config.isAllowedEmail(dto.email)) {
      throw new BadRequestException(
        `Only ${this.config.allowedEmailDomains.join(', ')} emails can be invited`,
      );
    }
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('That user already has access');

    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, invitedById: inviter.id },
      include: withInviter,
    });
    await this.audit.record({
      action: 'user.invite',
      entity: 'user',
      entityId: user.id,
      detail: { email: user.email },
    });
    return user;
  }

  async remove(id: string, actor: User): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('You cannot remove yourself');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });
    await this.audit.record({
      action: 'user.remove',
      entity: 'user',
      entityId: id,
      detail: { email: user.email },
    });
  }
}
