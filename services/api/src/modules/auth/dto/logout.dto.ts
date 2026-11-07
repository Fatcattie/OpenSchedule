/**
 * 注销请求 DTO（§3.5.1：POST /auth/logout 注销=吊销 refresh token jti）。
 */
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  /** 移动端原生经请求体传；Web Cookie 模式（X-Auth-Transport: cookie）可省略，改由 HttpOnly Cookie 携带（M-5） */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}