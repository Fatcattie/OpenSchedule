/**
 * 注销请求 DTO（§3.5.1：POST /auth/logout 注销=吊销 refresh token jti）。
 */
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 必填' })
  refreshToken!: string;
}