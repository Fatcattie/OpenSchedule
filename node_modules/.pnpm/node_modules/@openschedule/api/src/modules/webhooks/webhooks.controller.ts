/**
 * webhooks.controller.ts
 */
import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { WebhooksService } from './webhooks.service'
import { CreateWebhookDto, UpdateWebhookDto, ToggleWebhookDto } from './dto/webhook.dto'

@Controller('webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  /** GET /webhooks/events —— 支持的事件类型 */
  @Get('events')
  listEvents() {
    return this.webhooksService.listEvents()
  }

  /** GET /webhooks */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.webhooksService.list(user)
  }

  /** GET /webhooks/:id */
  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.webhooksService.get(id, user)
  }

  /** POST /webhooks */
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWebhookDto,
  ) {
    return this.webhooksService.create(user, body)
  }

  /** PUT /webhooks/:id */
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateWebhookDto,
  ) {
    return this.webhooksService.update(id, user, body)
  }

  /** DELETE /webhooks/:id */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.webhooksService.remove(id, user)
  }

  /** POST /webhooks/:id/toggle */
  @Post(':id/toggle')
  async toggle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ToggleWebhookDto,
  ) {
    return this.webhooksService.toggle(id, user, body.isActive)
  }

  /** POST /webhooks/:id/test —— 发送测试事件 */
  @Post(':id/test')
  async test(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.webhooksService.test(id, user)
  }
}
