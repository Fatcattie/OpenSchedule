/**
 * 协作工作台集合白名单（D-07 一期）：原前端 localStorage 键 → 可见范围。
 * - tenant：租户内共享（工作台任务、SOP、经验、Wiki、提示词/技能库、AI 规则、Meta 配置），viewer 只读；
 * - user：个人私有（提醒、转发日志、心情、日历同步设置），属主 = 当前用户，viewer 也可写自己的。
 * 纯函数，无依赖；条目键/体积上限在此集中定义，service 与 DTO 共用。
 */
import type { AuthUser } from '../../common/auth/auth-user.interface';
import { TENANT_ROLE_KEYS } from '../../common/constants/tenant-roles';

export type WorkspaceCollectionScope = 'tenant' | 'user';

export const WORKSPACE_COLLECTIONS: Readonly<Record<string, WorkspaceCollectionScope>> = {
  tasks: 'tenant',
  sops: 'tenant',
  experience: 'tenant',
  wiki_kb: 'tenant',
  prompts: 'tenant',
  skills: 'tenant',
  ai_rules: 'tenant',
  ai_rule_overrides: 'tenant',
  meta_config: 'tenant',
  reminders: 'user',
  notification_forward_log: 'user',
  os_mood_v1: 'user',
  calendar_sync_settings: 'user',
  calendar_synced_refs: 'user',
};

/** 单批最多条目操作数（upserts + deletes） */
export const MAX_BATCH_OPS = 500;
/** 单条目 data 序列化后上限（工作台任务可内嵌 base64 说明图片） */
export const MAX_ITEM_BYTES = 2 * 1024 * 1024;
/** 条目键：1–200 个非控制字符（前端 id 形如 task-004 / sopn-xxx-1；`__order__`/`__value__` 为编码保留键） */
export const ITEM_KEY_PATTERN = /^[^\u0000-\u001f\u007f]{1,200}$/;

export function collectionScope(collection: string): WorkspaceCollectionScope | null {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_COLLECTIONS, collection)
    ? WORKSPACE_COLLECTIONS[collection]
    : null;
}

/** 集合在库中的属主键：共享集合 ''，私有集合 = userId */
export function ownerKeyFor(scope: WorkspaceCollectionScope, user: AuthUser): string {
  return scope === 'user' ? user.userId : '';
}

/** 共享集合写权限：须持有 owner/admin/member 任一租户角色（纯 viewer 只读） */
export function canWriteShared(user: AuthUser): boolean {
  const writable: string[] = [TENANT_ROLE_KEYS.OWNER, TENANT_ROLE_KEYS.ADMIN, TENANT_ROLE_KEYS.MEMBER];
  return user.roles.some((r) => r.scope === 'tenant' && writable.includes(r.key));
}

/** data 序列化体积（UTF-8 字节） */
export function jsonByteLength(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data) ?? '', 'utf8');
}
