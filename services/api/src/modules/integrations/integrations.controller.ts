/**
 * IntegrationsController —— 钉钉 / 飞书 集成出口
 *
 * 所有第三方调用都必须经过后端：浏览器不允许直连 MCP，凭证也只在服务端保存。
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { IntegrationsService } from './integrations.service'
import type { ImProvider } from './adapters/im-adapter.interface'

const isProvider = (v: string): v is ImProvider => v === 'feishu' || v === 'dingtalk'

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  /** 各渠道连接状态 */
  @Get('status')
  status() {
    return this.service.status()
  }

  /** 拉取外部日历事件（反向同步来源） */
  @Get(':provider/calendar/events')
  listEvents(
    @Param('provider') provider: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    if (!isProvider(provider)) return { data: [], error: `不支持的渠道：${provider}` }
    const to = end ? new Date(end) : new Date(Date.now() + 7 * 86400_000)
    const from = start ? new Date(start) : new Date()
    return this.service.listEvents(provider, from, to)
  }

  /** 推送任务/项目为日历事件（单向） */
  @Post(':provider/calendar/events')
  createEvent(@Param('provider') provider: string, @Body() body: Record<string, unknown>) {
    if (!isProvider(provider)) return { ok: false, error: `不支持的渠道：${provider}` }
    return this.service.createEvent(provider, {
      title: String(body.title ?? ''),
      description: body.description ? String(body.description) : undefined,
      startAt: String(body.startAt ?? new Date().toISOString()),
      endAt: String(body.endAt ?? new Date(Date.now() + 3600_000).toISOString()),
      allDay: Boolean(body.allDay),
      taskId: body.taskId ? String(body.taskId) : undefined,
      projectId: body.projectId ? String(body.projectId) : undefined,
    })
  }

  /** 发送 IM 消息 */
  @Post(':provider/messages')
  sendMessage(@Param('provider') provider: string, @Body() body: Record<string, unknown>) {
    if (!isProvider(provider)) return { provider, ok: false, error: `不支持的渠道：${provider}` }
    return this.service.sendMessage(provider, {
      targets: Array.isArray(body.targets) ? (body.targets as string[]).map(String) : [],
      title: String(body.title ?? ''),
      content: String(body.content ?? ''),
      link: body.link ? String(body.link) : undefined,
    })
  }
}
