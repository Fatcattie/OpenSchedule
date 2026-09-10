/**
 * templates.controller.ts —— 模板库控制器（B19）
 */
import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common'
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator'
import { TemplatesService } from './templates.service'
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SaveAsTemplateDto,
  ApplyTemplateDto,
} from './dto/templates.dto'

@Controller('templates')
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  /** GET /api/v1/templates?type=project&keyword=xxx（模板列表） */
  @Get()
  async listTemplates(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
    @Query('isPublic') isPublic?: string,
  ) {
    const pub = isPublic != null ? isPublic === 'true' : undefined
    return this.templatesService.listTemplates(user, { type, keyword, isPublic: pub })
  }

  /** GET /api/v1/templates/:id（模板详情） */
  @Get(':id')
  async getTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.templatesService.getTemplate(id, user)
  }

  /** POST /api/v1/templates（创建模板） */
  @Post()
  async createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTemplateDto,
  ) {
    return this.templatesService.createTemplate(user, {
      ...body,
      taskSnapshot: body.taskSnapshot ?? [],
      dependencySnapshot: body.dependencySnapshot ?? [],
    })
  }

  /** PUT /api/v1/templates/:id（更新模板） */
  @Put(':id')
  async updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateTemplateDto,
  ) {
    return this.templatesService.updateTemplate(id, user, body)
  }

  /** DELETE /api/v1/templates/:id（删除模板，软删） */
  @Delete(':id')
  async deleteTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.templatesService.deleteTemplate(id, user)
  }

  /** POST /api/v1/templates/:id/apply（从模板创建项目） */
  @Post(':id/apply')
  async applyTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ApplyTemplateDto,
  ) {
    return this.templatesService.applyTemplate(id, user, body)
  }

  /** POST /api/v1/projects/:projectId/save-as-template（从项目保存为模板，快捷方式） */
  @Post('projects/:projectId/save-as-template')
  async saveAsTemplate(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() body: SaveAsTemplateDto,
  ) {
    return this.templatesService.saveProjectAsTemplate(projectId, user, body)
  }
}
