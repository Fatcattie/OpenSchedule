/**
 * 租户/项目角色模板常量（§3.4 权限矩阵）：3 租户角色 admin/member/viewer + owner（租户创建者），
 * 项目负责人 = projects.owner_id 派生（非独立角色实体），project.member/viewer 为项目级分配模板。
 * 权限点编码如 task:update、member:invite（roles.permissions jsonb 数组）；'*' = 全部。
 * 种子由 modules/rbac/role-seed.service.ts 在启动时落库（tenant_id NULL = 系统级模板）。
 */
export const TENANT_ROLE_KEYS = {
  OWNER: 'tenant.owner',
  ADMIN: 'tenant.admin',
  MEMBER: 'tenant.member',
  VIEWER: 'tenant.viewer',
} as const;

export const PROJECT_ROLE_KEYS = {
  OWNER: 'project.owner',
  MEMBER: 'project.member',
  VIEWER: 'project.viewer',
} as const;

/** 权限点清单（roles.permissions 数组元素；'*' 通配全部） */
export const PERMISSIONS = {
  PROJECT_CREATE: 'project:create',
  PROJECT_VIEW: 'project:view',
  PROJECT_EDIT: 'project:edit',
  PROJECT_ARCHIVE: 'project:archive',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_MEMBERS: 'project:manage-members',
  TASK_CREATE: 'task:create',
  TASK_VIEW: 'task:view',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  TASK_ASSIGN: 'task:assign',
  TASK_CLAIM: 'task:claim',
  TASK_TRANSFER: 'task:transfer',
  TASK_STATUS: 'task:status',
  COMMENT_CREATE: 'comment:create',
  COMMENT_MODERATE: 'comment:moderate',
  ATTACHMENT_UPLOAD: 'attachment:upload',
  ATTACHMENT_DOWNLOAD: 'attachment:download',
  AI_PROPOSE: 'ai:propose',
  AI_APPROVE: 'ai:approve',
  AUDIT_VIEW: 'audit:view',
  MEMBER_INVITE: 'member:invite',
  MEMBER_REMOVE: 'member:remove',
  ROLE_MANAGE: 'role:manage',
  TEMPLATE_MANAGE: 'template:manage',
  IMPORT_EXPORT_ALL: 'import-export:all',
  IMPORT_EXPORT_OWN: 'import-export:own',
  NOTIFICATION_MANAGE: 'notification:manage',
  PERSONAL_ALL: 'personal:all',
  REMINDER_MANAGE: 'reminder:manage',
} as const;

export interface RoleTemplate {
  key: string;
  name: string;
  scope: 'system' | 'tenant' | 'project' | 'task';
  permissions: string[];
}

/** 系统级角色模板（tenant_id NULL；权限按 §3.4 权限矩阵） */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: TENANT_ROLE_KEYS.OWNER,
    name: '租户所有者',
    scope: 'tenant',
    permissions: ['*'], // 租户创建者，全量权限（含角色管理/邀请/移除）
  },
  {
    key: TENANT_ROLE_KEYS.ADMIN,
    name: '租户管理员',
    scope: 'tenant',
    permissions: ['*'], // 租户管理员（§3.4：Admin 含 Owner 能力；可由 owner 再分配）
  },
  {
    key: TENANT_ROLE_KEYS.MEMBER,
    name: '租户成员',
    scope: 'tenant',
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.TASK_CREATE,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.TASK_UPDATE,
      PERMISSIONS.TASK_DELETE,
      PERMISSIONS.TASK_ASSIGN,
      PERMISSIONS.TASK_CLAIM,
      PERMISSIONS.TASK_TRANSFER,
      PERMISSIONS.TASK_STATUS,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.COMMENT_MODERATE,
      PERMISSIONS.ATTACHMENT_UPLOAD,
      PERMISSIONS.ATTACHMENT_DOWNLOAD,
      PERMISSIONS.AI_PROPOSE,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.IMPORT_EXPORT_OWN,
      PERMISSIONS.PERSONAL_ALL,
      PERMISSIONS.REMINDER_MANAGE,
    ],
  },
  {
    key: TENANT_ROLE_KEYS.VIEWER,
    name: '租户只读',
    scope: 'tenant',
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.COMMENT_CREATE, // §3.4：默认只读可评论
      PERMISSIONS.ATTACHMENT_DOWNLOAD,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.PERSONAL_ALL,
    ],
  },
  {
    key: PROJECT_ROLE_KEYS.OWNER,
    name: '项目负责人（模板）',
    scope: 'project',
    permissions: ['*'], // 注意：项目负责人权限实际由 projects.owner_id 派生判定（§3.4），本模板仅供展示/克隆
  },
  {
    key: PROJECT_ROLE_KEYS.MEMBER,
    name: '项目成员',
    scope: 'project',
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_CREATE,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.TASK_UPDATE,
      PERMISSIONS.TASK_CLAIM,
      PERMISSIONS.TASK_TRANSFER,
      PERMISSIONS.TASK_STATUS,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.ATTACHMENT_UPLOAD,
      PERMISSIONS.ATTACHMENT_DOWNLOAD,
    ],
  },
  {
    key: PROJECT_ROLE_KEYS.VIEWER,
    name: '项目只读',
    scope: 'project',
    permissions: [
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.TASK_VIEW,
      PERMISSIONS.COMMENT_CREATE,
      PERMISSIONS.ATTACHMENT_DOWNLOAD,
    ],
  },
];
