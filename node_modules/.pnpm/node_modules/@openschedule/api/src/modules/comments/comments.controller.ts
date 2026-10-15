/**
 * 评论控制器（§3.5.1：GET/POST /tasks/:id/comments、PATCH/DELETE /comments/:id、POST /comments/:id/reply）。
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CommentsService } from './comments.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { CommentQueryDto } from './dto/comment-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReplyCommentDto } from './dto/reply-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** GET /api/v1/tasks/:id/comments 评论列表 */
  @Get('tasks/:taskId/comments')
  async list(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Query() query: CommentQueryDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.comments.listByTask(taskId, user, query);
    res.setHeader('X-Total-Count', String(result.meta.total));
    return result;
  }

  /** POST /api/v1/tasks/:id/comments 发评论（@提及自动解析 → 通知被提及人） */
  @Post('tasks/:taskId/comments')
  create(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(taskId, user, dto);
  }

  /** PATCH /api/v1/comments/:id 编辑（作者/项目负责人/租户 Admin） */
  @Patch('comments/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(id, user, dto);
  }

  /** DELETE /api/v1/comments/:id 软删 */
  @Delete('comments/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comments.softDelete(id, user);
  }

  /** POST /api/v1/comments/:id/reply 回复（讨论串） */
  @Post('comments/:id/reply')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyCommentDto) {
    return this.comments.reply(id, user, dto);
  }
}
