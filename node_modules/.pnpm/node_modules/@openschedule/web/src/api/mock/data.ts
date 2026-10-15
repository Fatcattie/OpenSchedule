/**
 * 职责：mock 种子数据 —— 模拟后端返回的用户/项目/任务/评论（字段 camelCase，与 types 对齐）
 * 仅用于后端未就绪时的本地演示；真实模式（VITE_USE_MOCK=false）不会引用本文件
 */
import type { Project, Task, TaskComment, User } from '@/types'

export const mockTenant = {
  id: 'tenant-001',
  name: '北极星研发组',
  plan: 'pro',
  status: 'active',
} as const

export const mockMe: User = {
  id: 'user-001',
  email: 'zhangwei@example.com',
  displayName: '张伟',
  avatarUrl: null,
  locale: 'zh-CN',
  timezone: 'Asia/Shanghai',
  status: 'active',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-10T08:00:00.000Z',
}

export const mockUsers: User[] = [
  mockMe,
  {
    id: 'user-002',
    email: 'lina@example.com',
    displayName: '李娜',
    avatarUrl: null,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: 'active',
    createdAt: '2026-01-12T08:00:00.000Z',
    updatedAt: '2026-01-12T08:00:00.000Z',
  },
  {
    id: 'user-003',
    email: 'wangqiang@example.com',
    displayName: '王强',
    avatarUrl: null,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    status: 'active',
    createdAt: '2026-01-15T08:00:00.000Z',
    updatedAt: '2026-01-15T08:00:00.000Z',
  },
]

/** 相对今天偏移 N 天的 ISO 时间（mock 数据时间随演示日期滚动） */
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

export const mockProjects: Project[] = [
  {
    id: 'project-001',
    tenantId: 'tenant-001',
    name: '官网改版 2026 Q3',
    description: '官网 2.0 改版：视觉升级 + 内容重构 + 性能优化',
    ownerId: 'user-001',
    status: 'active',
    deadline: day(45),
    workflowId: null,
    createdBy: 'user-001',
    createdAt: day(-30),
    updatedAt: day(-2),
  },
  {
    id: 'project-002',
    tenantId: 'tenant-001',
    name: '内部效率工具',
    description: '团队内部脚手架与效率小工具集合',
    ownerId: 'user-002',
    status: 'active',
    deadline: null,
    workflowId: null,
    createdBy: 'user-001',
    createdAt: day(-60),
    updatedAt: day(-10),
  },
]

export const mockTasks: Task[] = [
  // 官网改版项目：覆盖全部状态（看板三列 + blocked/cancelled 演示）
  {
    id: 'task-001', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '需求文档评审', description: '与产品确认 V2 需求范围，输出评审结论',
    status: 'todo', priority: 'high', assigneeId: 'user-001',
    dueAt: day(3), estimatedHours: 4, actualHours: null, completedAt: null, startedAt: null,
    createdBy: 'user-001', tags: ['评审'], sortOrder: 1, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-5), updatedAt: day(-5),
  },
  {
    id: 'task-002', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '设计走查清单', description: '对照视觉规范整理走查点',
    status: 'todo', priority: 'medium', assigneeId: null,
    dueAt: day(7), estimatedHours: 2, actualHours: null, completedAt: null, startedAt: null,
    createdBy: 'user-001', tags: ['设计'], sortOrder: 2, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-5), updatedAt: day(-5),
  },
  {
    id: 'task-003', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '竞品分析报告', description: '收集 5 家竞品首页信息架构',
    status: 'todo', priority: 'low', assigneeId: 'user-002',
    dueAt: day(10), estimatedHours: 6, actualHours: null, completedAt: null, startedAt: null,
    startAt: day(8), endAt: day(16), // 演示跨周（8 天）→ 周看板进侧栏、月看板跨格
    createdBy: 'user-002', tags: ['调研'], sortOrder: 3, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-4), updatedAt: day(-4),
  },
  {
    id: 'task-004', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '首页原型设计', description: '高保真原型，覆盖首屏/导航/列表页',
    status: 'in_progress', priority: 'high', assigneeId: 'user-002',
    dueAt: day(-1), estimatedHours: 16, actualHours: 6, completedAt: null, startedAt: day(-3),
    createdBy: 'user-001', tags: ['设计', '原型'], sortOrder: 4, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-6), updatedAt: day(-1),
  },
  {
    id: 'task-005', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '组件库搭建', description: 'AntD 基础上封装业务组件，含主题 token',
    status: 'in_progress', priority: 'urgent', assigneeId: 'user-003',
    dueAt: day(2), estimatedHours: 24, actualHours: 10, completedAt: null, startedAt: day(-2),
    startAt: day(-1), endAt: day(3), // 演示跨日（4 天）→ 日看板进侧栏、周看板跨格
    createdBy: 'user-001', tags: ['前端'], sortOrder: 5, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-6), updatedAt: day(-1),
  },
  {
    id: 'task-006', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '接口联调环境', description: '搭建本地 mock + 联调环境',
    status: 'in_progress', priority: 'medium', assigneeId: 'user-001',
    dueAt: day(5), estimatedHours: 8, actualHours: 2, completedAt: null, startedAt: day(-1),
    createdBy: 'user-001', tags: ['基建'], sortOrder: 6, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-3), updatedAt: day(-1),
  },
  {
    id: 'task-007', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '视觉规范定稿', description: '色板/字体/间距规范评审通过',
    status: 'done', priority: 'high', assigneeId: 'user-002',
    dueAt: day(-4), estimatedHours: 12, actualHours: 11, completedAt: day(-4), startedAt: day(-8),
    createdBy: 'user-001', tags: ['设计'], sortOrder: 7, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-12), updatedAt: day(-4),
  },
  {
    id: 'task-008', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '技术选型确认', description: '框架/部署/监控选型评审',
    status: 'done', priority: 'medium', assigneeId: 'user-003',
    dueAt: day(-6), estimatedHours: 6, actualHours: 5, completedAt: day(-6), startedAt: day(-9),
    createdBy: 'user-001', tags: ['架构'], sortOrder: 8, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-14), updatedAt: day(-6),
  },
  {
    id: 'task-009', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '第三方登录接入受阻', description: '等待服务商审核回调域名',
    status: 'blocked', priority: 'high', assigneeId: 'user-003',
    dueAt: day(4), estimatedHours: 4, actualHours: 1, completedAt: null, startedAt: day(-2),
    createdBy: 'user-001', tags: ['接入'], sortOrder: 9, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-7), updatedAt: day(-2),
  },
  {
    id: 'task-010', tenantId: 'tenant-001', projectId: 'project-001', parentId: null,
    title: '旧版首页下架', description: '迁移完成后下线旧版',
    status: 'cancelled', priority: 'low', assigneeId: null,
    dueAt: null, estimatedHours: 2, actualHours: null, completedAt: null, startedAt: null,
    createdBy: 'user-001', tags: ['运维'], sortOrder: 10, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-15), updatedAt: day(-8),
  },
  // 内部效率工具项目
  {
    id: 'task-011', tenantId: 'tenant-001', projectId: 'project-002', parentId: null,
    title: '脚手架模板升级', description: '升级 create-tool 模板到最新规范',
    status: 'todo', priority: 'medium', assigneeId: 'user-001',
    dueAt: day(14), estimatedHours: 8, actualHours: null, completedAt: null, startedAt: null,
    startAt: day(-20), endAt: day(20), // 演示跨月（约 40 天）→ 月看板进侧栏、年看板跨格
    createdBy: 'user-002', tags: ['基建'], sortOrder: 1, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-2), updatedAt: day(-2),
  },
  {
    id: 'task-012', tenantId: 'tenant-001', projectId: 'project-002', parentId: null,
    title: '日志查询小工具', description: 'CLI 快速查询线上日志',
    status: 'in_progress', priority: 'high', assigneeId: 'user-001',
    dueAt: day(8), estimatedHours: 10, actualHours: 3, completedAt: null, startedAt: day(-1),
    createdBy: 'user-001', tags: ['工具'], sortOrder: 2, workflowColumnId: null,
    isAiGenerated: false, version: 1, createdAt: day(-3), updatedAt: day(-1),
  },
]

export const mockComments: TaskComment[] = [
  {
    id: 'comment-001', tenantId: 'tenant-001', taskId: 'task-004', authorId: 'user-001', parentId: null,
    content: '原型已过初稿评审，重点优化首屏加载路径。',
    mentions: [], isDecision: true,
    createdAt: day(-2), updatedAt: day(-2),
  },
  {
    id: 'comment-002', tenantId: 'tenant-001', taskId: 'task-004', authorId: 'user-003', parentId: null,
    content: '组件库侧会同步提供对应样式 token，联调时直接引用。',
    mentions: [], isDecision: false,
    createdAt: day(-1), updatedAt: day(-1),
  },
]
