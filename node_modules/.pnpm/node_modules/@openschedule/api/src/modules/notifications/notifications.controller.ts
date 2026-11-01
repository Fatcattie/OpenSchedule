/**
 * 通知控制器（§3.5.1 通知与提醒域端点：/notifications 收件箱、已读、全部已读、偏好、Push 订阅）。
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { SubscribePushSubscriptionDto, UnsubscribePushSubscriptionDto } from './dto/push-subscription.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** GET /api/v1/notifications 通知收件箱（按类型/状态筛选；meta 带 unreadCount） */
  @Get('notifications')
  async list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.notifications.list(user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** PATCH /api/v1/notifications/:id/read 已读（read=false 标回未读） */
  @Patch('notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.notifications.markRead(id, user, dto);
  }

  /** POST /api/v1/notifications/read-all 全部已读 */
  @Post('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  /** GET /api/v1/notifications/preferences 通知偏好 + 免打扰 */
  @Get('notifications/preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.listPreferences(user);
  }

  /** PUT /api/v1/notifications/preferences 写入偏好（eventType 缺省 '*' 通配默认项） */
  @Put('notifications/preferences')
  putPreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.notifications.putPreferences(user, dto);
  }

  /** GET /api/v1/notifications/push-subscriptions 本人 WebPush 订阅列表 */
  @Get('notifications/push-subscriptions')
  listPushSubscriptions(@CurrentUser() user: AuthUser) {
    return this.notifications.listPushSubscriptions(user);
  }

  /** POST /api/v1/notifications/push-subscriptions 注册订阅（endpoint 唯一，SSRF 校验） */
  @Post('notifications/push-subscriptions')
  addPushSubscription(@CurrentUser() user: AuthUser, @Body() dto: SubscribePushSubscriptionDto) {
    return this.notifications.addPushSubscription(user, dto);
  }

  /** DELETE /api/v1/notifications/push-subscriptions 注销订阅（仅本人） */
  @Delete('notifications/push-subscriptions')
  removePushSubscription(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribePushSubscriptionDto) {
    return this.notifications.removePushSubscription(user, dto.endpoint);
  }
}
