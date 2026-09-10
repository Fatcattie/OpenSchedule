/**
 * 登录请求 DTO（§3.5.1：POST /auth/login，返回 access+refresh）。
 * 失败响应：40101 认证失败（账号/密码错误统一语义，防枚举探测）。
 */
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}