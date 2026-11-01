/**
 * 管理员代建成员 DTO（R6-1 / D-05 B）：POST /auth/members。
 * 管理员（tenant.owner/admin）为成员创建账号：临时密码 + 首次登录强制改密。
 */
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMemberDto {
  /** 登录名（唯一；服务端统一小写化） */
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255)
  email!: string;

  /** 临时初始密码（≥8；用户首次登录后强制改密） */
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码过长（bcrypt 上限 72 字节）' })
  password!: string;

  /** 显示名（≤100） */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string;

  /** 租户角色别名（admin/member/viewer；默认 member；owner 不可代建） */
  @IsOptional()
  @IsIn(['admin', 'member', 'viewer'], { message: '角色仅支持 admin/member/viewer' })
  role?: 'admin' | 'member' | 'viewer';
}