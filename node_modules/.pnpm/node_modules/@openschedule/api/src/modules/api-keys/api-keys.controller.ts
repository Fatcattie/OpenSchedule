/**
 * api-keys.controller.ts
 */
import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { ApiKeysService } from './api-keys.service'
import { CreateApiKeyDto } from './dto/api-key.dto'

@Controller('api-keys')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.apiKeysService.list(user)
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(user, body)
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.revoke(id, user)
  }
}
