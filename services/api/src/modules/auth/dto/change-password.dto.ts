/**
 * 改密 DTO（R6-1：POST /auth/change-password）。
 * 首次登录强制改密经此端点：校验临时密码（currentPassword）后写入新密码并清除 must_change_password。
 */
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /** 当前密码（首次改密场景 = 管理员给的临时密码） */
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  /** 新密码（≥8；bcrypt 上限 72 字节） */
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码过长（bcrypt 上限 72 字节）' })
  newPassword!: string;
}