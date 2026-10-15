/**
 * 注册请求 DTO（§3.5.1：POST /auth/register 注册：创建账号 + 可选创建租户）。
 * 校验规则：邮箱格式、密码 ≥8 字符（bcrypt 上限 72 字节）、显示名 ≤100。
 */
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** 登录名（唯一；服务端统一小写化） */
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255)
  email!: string;

  /** 明文密码；bcrypt 哈希落库（SSO 用户可空，Phase 2） */
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码过长（bcrypt 上限 72 字节）' })
  password!: string;

  /** 显示名（≤100，§3.2 users.display_name） */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string;

  /** 是否同时创建租户（默认 true；false = 邀请加入，Phase 2 TODO） */
  @IsOptional()
  @IsBoolean()
  createTenant?: boolean;

  /** 团队名（默认「{displayName} 的团队」） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantName?: string;
}