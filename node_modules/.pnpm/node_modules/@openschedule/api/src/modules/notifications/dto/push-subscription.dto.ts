/**
 * WebPush 订阅 DTO（R5-3 / D-11）：浏览器 pushManager.subscribe() 结果上报。
 * endpoint 为服务器出站 POST 目标，写入前经 url-guard SSRF 校验；p256dh/auth 为端到端加密材料。
 */
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SubscribePushSubscriptionDto {
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  @MaxLength(500)
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  auth!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}

export class UnsubscribePushSubscriptionDto {
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  @MaxLength(500)
  endpoint!: string;
}
