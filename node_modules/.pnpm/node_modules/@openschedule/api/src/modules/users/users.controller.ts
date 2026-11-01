/**
 * 人员管理真实 API（users.yaml / roles.yaml 契约切片）—— 薄控制器，只做参数/元数据装配：
 * - 认证：全局 JwtAuthGuard（Bearer access token，TenantFilterMiddleware 注入租户上下文）
 * - 授权：PersonnelAuthzGuard（权限矩阵 + 对象级 + 最后活跃 super_admin 409 不变量；默认拒绝）
 *
 * R7-6 双鉴权收敛：人员域历史走独立 cookie 会话 + CSRF 已删除（详见 docs/contracts/personnel-permission-matrix.md
 * 变更记录）；Bearer token 不会被浏览器自动附加，OWASP 视为对 CSRF 免疫的鉴权形态。
 *
 * 响应形状 { user } / { items, nextCursor } / 能力包（roles.yaml CapabilitiesResponse），统一错误信封由全局异常过滤器兜底。
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePersonnelAction, PersonnelAuthzGuard, toPersonnelRole } from '../../middleware/authz';
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { CreatePersonnelDto, PersonnelListQueryDto, SetPersonnelStatusDto, UpdatePersonnelDto } from './dto/personnel.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(PersonnelAuthzGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** 列表：按操作者可管范围服务端裁剪；越界 role 过滤 403；游标分页（users.yaml listUsers） */
  @RequirePersonnelAction({ action: 'list' })
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: PersonnelListQueryDto,
  ): Promise<{ items: unknown; nextCursor: string | null }> {
    return this.users.list(user.tenantId, toPersonnelRole(user.roles), query);
  }

  /** 创建：admin 只能建 member，super_admin 可选 admin/member（守卫 + 服务双重强制，409 邮箱冲突） */
  @RequirePersonnelAction({ action: 'create' })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePersonnelDto,
  ): Promise<{ user: unknown }> {
    const created = await this.users.create(user.tenantId, user.userId, toPersonnelRole(user.roles), dto);
    return { user: created };
  }

  /** 对象级读：目标越权 403（不泄露目标角色/存在性），不存在 404 */
  @RequirePersonnelAction({ action: 'read', targetParam: 'userId' })
  @Get(':userId')
  async get(@CurrentUser() user: AuthUser, @Param('userId') userId: string): Promise<{ user: unknown }> {
    const view = await this.users.get(user.tenantId, userId, toPersonnelRole(user.roles));
    return { user: view };
  }

  /** 更新资料/角色指派：角色按目标当前快照复核（防请求体提权），最后活跃 super_admin 409 */
  @RequirePersonnelAction({ action: 'update', targetParam: 'userId' })
  @Patch(':userId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdatePersonnelDto,
  ): Promise<{ user: unknown }> {
    const view = await this.users.update(user.tenantId, user.userId, toPersonnelRole(user.roles), userId, dto);
    return { user: view };
  }

  /** 启用/禁用：最后活跃 super_admin 不可禁用（409）；禁用后无法再登录 */
  @RequirePersonnelAction({ action: 'set_status', targetParam: 'userId' })
  @Post(':userId/status')
  async setStatus(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: SetPersonnelStatusDto,
  ): Promise<{ user: unknown }> {
    const view = await this.users.setStatus(user.tenantId, user.userId, toPersonnelRole(user.roles), userId, dto);
    return { user: view };
  }

  /** 删除（事务软删：解绑角色 + 置 disabled）；最后活跃 super_admin 409；204 无响应体 */
  @RequirePersonnelAction({ action: 'delete', targetParam: 'userId' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':userId')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.users.remove(user.tenantId, user.userId, toPersonnelRole(user.roles), userId);
  }
}

/**
 * 能力自省（roles.yaml getMyCapabilities）：菜单/路由/按钮的唯一 UI 授权来源（FR-007）。
 * 任何已认证主体（含 member）都可读自己的能力包 —— member 收到全 false 包，
 * 403 只发生在真正执行越权动作时（隐藏 UI ≠ 授权，矩阵每请求重评）。
 */
@Controller('me')
@UseGuards(PersonnelAuthzGuard)
export class PersonnelMeController {
  constructor(private readonly users: UsersService) {}

  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthUser): Promise<{ userId: string; role: string; personnel: Record<string, unknown> }> {
    return this.users.capabilities(toPersonnelRole(user.roles), user.userId);
  }
}
