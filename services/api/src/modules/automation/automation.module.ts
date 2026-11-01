/**
 * automation.module.ts —— 自动化规则模块（B20 / R6-3）。
 * R6-3：导入 NotificationsModule（send_notification 动作出口）+ 挂载 AutomationListener（消费 task.* 事件）。
 */
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { AutomationService } from './automation.service'
import { AutomationListener } from './automation.listener'
import { AutomationController } from './automation.controller'

@Module({
  imports: [NotificationsModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationListener],
  exports: [AutomationService],
})
export class AutomationModule {}