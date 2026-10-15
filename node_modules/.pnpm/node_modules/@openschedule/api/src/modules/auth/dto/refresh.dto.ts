/**
 * 刷新令牌请求 DTO（§3.5.1：POST /auth/refresh；access 过期时用 refresh 换新，§3.1 40101 语义）。
 */
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 必填' })
  refreshToken!: string;
}