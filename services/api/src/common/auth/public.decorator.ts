/**
 * @Public() 装饰器：标记公开路由（跳过全局 JwtAuthGuard），如 /auth/register、/auth/login、/auth/refresh、/auth/logout。
 */
import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
