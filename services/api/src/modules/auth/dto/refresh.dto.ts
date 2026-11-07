/**
 * 刷新令牌请求 DTO（§3.5.1：POST /auth/refresh；access 过期时用 refresh 换新，§3.1 40101 语义）。
 */
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /** 移动端原生经请求体传；Web Cookie 模式（X-Auth-Transport: cookie）可省略，改由 HttpOnly Cookie 携带（M-5） */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}