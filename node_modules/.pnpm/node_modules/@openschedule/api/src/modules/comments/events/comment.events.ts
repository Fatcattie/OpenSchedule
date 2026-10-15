/**
 * 评论领域事件常量（§3.6：task.comment_created / mention.parsed；payload 契约唯一来源 packages/domain-events，TODO 迁移）。
 */
export const COMMENT_EVENTS = {
  CREATED: 'task.comment_created',
  MENTION_PARSED: 'mention.parsed',
} as const;
