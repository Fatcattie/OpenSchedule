import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { ApiException } from '../../common/exceptions/api.exception';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PersonnelRole } from '../../middleware/authz';
import { CreatePersonnelDto, PersonnelListQueryDto, SetPersonnelStatusDto, UpdatePersonnelDto } from './dto/personnel.dto';

const ROLE_KEY: Record<PersonnelRole, string> = {
  super_admin: 'tenant.owner',
  admin: 'tenant.admin',
  member: 'tenant.member',
};

const ROLE_BY_KEY: Record<string, PersonnelRole> = {
  'tenant.owner': 'super_admin',
  'tenant.admin': 'admin',
  'tenant.member': 'member',
};

export interface PersonnelUserView {
  id: string;
  email: string;
  displayName: string;
  role: PersonnelRole;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, actorRole: PersonnelRole, query: PersonnelListQueryDto): Promise<{ items: PersonnelUserView[]; nextCursor: string | null }> {
    const allowed = this.allowedTargetRoles(actorRole);
    if (query.role && !allowed.includes(query.role)) {
      throw ApiException.forbidden('无权查看该角色用户');
    }
    const targetRoles = query.role ? [query.role] : allowed;
    if (targetRoles.length === 0) throw ApiException.forbidden('无权访问人员管理');

    const users = await this.prisma.user.findMany({
      where: {
        ...(query.status ? { status: query.status } : { status: 'active' }),
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search.trim(), mode: 'insensitive' } },
                { displayName: { contains: query.search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
        userRoles: {
          some: {
            tenantId,
            scopeResourceId: null,
            role: { key: { in: targetRoles.map((role) => ROLE_KEY[role]) } },
          },
        },
      },
      include: {
        userRoles: {
          where: { tenantId, scopeResourceId: null },
          include: { role: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      take: 25,
    });

    const items = users
      .map((user) => {
        const role = user.userRoles.map((row) => ROLE_BY_KEY[row.role.key]).find((value): value is PersonnelRole => Boolean(value));
        return role ? this.toView(user, role) : null;
      })
      .filter((user): user is PersonnelUserView => user !== null);

    return { items, nextCursor: items.length === 25 ? items[items.length - 1].id : null };
  }

  async get(tenantId: string, userId: string, actorRole: PersonnelRole): Promise<PersonnelUserView> {
    const target = await this.loadTarget(tenantId, userId);
    this.assertTargetAllowed(actorRole, target.role, 'read');
    return target.view;
  }

  async create(tenantId: string, actorId: string, actorRole: PersonnelRole, dto: CreatePersonnelDto): Promise<PersonnelUserView> {
    this.assertTargetAllowed(actorRole, dto.role, 'create');
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ApiException(40901, '该邮箱已存在', HttpStatus.CONFLICT);

    const role = await this.prisma.role.findFirst({ where: { tenantId, key: ROLE_KEY[dto.role] } });
    if (!role) throw new ApiException(50000, '租户角色未初始化', HttpStatus.INTERNAL_SERVER_ERROR);

    const passwordHash = await hash(dto.password, 12);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, displayName: dto.displayName.trim(), passwordHash, status: 'active' },
        });
        await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
        await tx.memberProfile.create({ data: { tenantId, userId: user.id } });
        return user;
      });
      await this.audit.record({ tenantId, actorId, action: 'user.create', resourceType: 'user', resourceId: created.id, after: { email, role: dto.role } });
      return this.toView(created, dto.role);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(40901, '该邮箱已存在', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async update(tenantId: string, actorId: string, actorRole: PersonnelRole, userId: string, dto: UpdatePersonnelDto): Promise<PersonnelUserView> {
    const target = await this.loadTarget(tenantId, userId);
    this.assertTargetAllowed(actorRole, target.role, 'update');
    if (dto.role && !this.allowedTargetRoles(actorRole).includes(dto.role)) {
      throw ApiException.forbidden('无权分配该角色');
    }
    if (dto.role === 'super_admin') throw ApiException.forbidden('超级管理员角色不可通过人员管理新增或指派');

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        },
      });
      if (dto.role && dto.role !== target.role) {
        const role = await tx.role.findFirst({ where: { tenantId, key: ROLE_KEY[dto.role] } });
        if (!role) throw new ApiException(50000, '租户角色未初始化', HttpStatus.INTERNAL_SERVER_ERROR);
        await tx.userRole.deleteMany({ where: { tenantId, userId, scopeResourceId: null } });
        await tx.userRole.create({ data: { tenantId, userId, roleId: role.id } });
      }
      return user;
    });
    await this.audit.record({ tenantId, actorId, action: 'user.update', resourceType: 'user', resourceId: userId, after: { email: updated.email, displayName: updated.displayName, role: dto.role ?? target.role } });
    return this.toView(updated, dto.role ?? target.role);
  }

  /** 自我资料编辑（本地补充端点）：任何活跃用户可改自己的 displayName/email。
   *  人员管理范围矩阵天然不含自身（super_admin 管 admin/member、admin 管 member），
   *  故自我编辑不走该矩阵，单独提供端点；禁止修改角色，写审计日志。 */
  async updateSelf(tenantId: string, actorId: string, dto: UpdatePersonnelDto): Promise<PersonnelUserView> {
    if (dto.role !== undefined) throw ApiException.forbidden('不能通过自我资料编辑修改角色');
    const target = await this.loadTarget(tenantId, actorId);
    const updated = await this.prisma.user.update({
      where: { id: actorId },
      data: {
        ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
      },
    });
    await this.audit.record({ tenantId, actorId, action: 'me.profile.update', resourceType: 'user', resourceId: actorId, after: { email: updated.email, displayName: updated.displayName } });
    return this.toView(updated, target.role);
  }

  async setStatus(tenantId: string, actorId: string, actorRole: PersonnelRole, userId: string, dto: SetPersonnelStatusDto): Promise<PersonnelUserView> {
    const target = await this.loadTarget(tenantId, userId);
    this.assertTargetAllowed(actorRole, target.role, 'set_status');
    if (target.role === 'super_admin' && dto.status === 'disabled') throw new ApiException(40903, '不能禁用超级管理员', HttpStatus.CONFLICT);
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status: dto.status } });
    await this.audit.record({ tenantId, actorId, action: 'user.status', resourceType: 'user', resourceId: userId, before: { status: target.view.status }, after: { status: dto.status } });
    return this.toView(updated, target.role);
  }

  async remove(tenantId: string, actorId: string, actorRole: PersonnelRole, userId: string): Promise<void> {
    const target = await this.loadTarget(tenantId, userId);
    this.assertTargetAllowed(actorRole, target.role, 'delete');
    if (target.role === 'super_admin') throw new ApiException(40903, '不能删除超级管理员', HttpStatus.CONFLICT);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { tenantId, userId, scopeResourceId: null } });
      await tx.user.update({ where: { id: userId }, data: { status: 'disabled' } });
    });
    await this.audit.record({ tenantId, actorId, action: 'user.delete', resourceType: 'user', resourceId: userId });
  }

  async capabilities(actor: PersonnelRole, userId: string): Promise<{ userId: string; role: PersonnelRole; personnel: Record<string, unknown> }> {
    const manageable = this.allowedTargetRoles(actor);
    return {
      userId,
      role: actor,
      personnel: {
        list: actor !== 'member',
        create: manageable.length > 0,
        update: manageable.length > 0,
        setStatus: manageable.length > 0,
        delete: manageable.length > 0,
        assignRole: actor === 'super_admin',
        manageableRoles: manageable,
      },
    };
  }

  private async loadTarget(tenantId: string, userId: string): Promise<{ role: PersonnelRole; view: PersonnelUserView }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, userRoles: { some: { tenantId, scopeResourceId: null } } },
      include: { userRoles: { where: { tenantId, scopeResourceId: null }, include: { role: true } } },
    });
    if (!user) throw ApiException.notFound('目标用户不存在或不可见');
    const role = user.userRoles.map((row) => ROLE_BY_KEY[row.role.key]).find((value): value is PersonnelRole => Boolean(value));
    if (!role) throw ApiException.notFound('目标用户不存在或不可见');
    return { role, view: this.toView(user, role) };
  }

  private assertTargetAllowed(actor: PersonnelRole, target: PersonnelRole, action: 'read' | 'create' | 'update' | 'set_status' | 'delete'): void {
    if (actor === 'super_admin' && (target === 'admin' || target === 'member')) return;
    if (actor === 'admin' && target === 'member') return;
    throw ApiException.forbidden(`无权执行人员管理操作：${action}`);
  }

  private allowedTargetRoles(actor: PersonnelRole): PersonnelRole[] {
    return actor === 'super_admin' ? ['admin', 'member'] : actor === 'admin' ? ['member'] : [];
  }

  private toView(user: { id: string; email: string; displayName: string; status: string; createdAt: Date; updatedAt: Date }, role: PersonnelRole): PersonnelUserView {
    return { id: user.id, email: user.email, displayName: user.displayName, role, status: user.status === 'active' ? 'active' : 'disabled', createdAt: user.createdAt, updatedAt: user.updatedAt };
  }
}
