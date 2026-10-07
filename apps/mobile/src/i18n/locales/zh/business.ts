/**
 * 职责：zh 字典 —— 业务组件域（增量 12 · L6 · T04 填充）。
 *
 * 键前缀：`business.*`（任务卡 / 项目卡 / 表单骨架 / 评论 / 日期时间字段 / 选择抽屉 /
 * 附件上传抽屉等业务组件文案）。本文件由 T04 独占。
 *
 * ★ 冻结约束：本文件所有 zh 值**逐字等于改造前源码中的中文字面串**（中文零回归）；
 *   状态 / 枚举标签（`taskStatus.*` / `projectStatus.*` / `priority.*` / `auditAction.*` /
 *   `auditOpinion.*` 等）一律复用 `domain.ts` 已派生键，不在本文件重复声明。
 */

/** 业务组件词条（T04 填充） */
export const business = {
  // ── 任务卡片（TaskCard）────────────────────────────────────────────
  'business.taskCard.overdue': '已逾期 {days} 天',
  'business.taskCard.dueToday': '今天到期',
  'business.taskCard.dueTomorrow': '明天到期',
  'business.taskCard.unassigned': '待领取',

  // ── 项目卡片（ProjectCard）────────────────────────────────────────
  'business.projectCard.deadline': '截止 {date}',
  'business.projectCard.overdue': '已逾期 {days} 天',
  'business.projectCard.remaining': '剩 {days} 天',
  'business.projectCard.noOwner': '未指定负责人',
  'business.projectCard.taskCount': '{count} 个任务',

  // ── 表单骨架（ItemForm）────────────────────────────────────────────
  'business.itemForm.banner.manager': '将直接创建，无需审核',
  'business.itemForm.submit.create': '创建',
  'business.itemForm.submit.directCreate': '直接创建',
  'business.itemForm.submit.submit': '提交提报',
  'business.itemForm.kind.project': '项目',
  'business.itemForm.kind.task': '任务',
  'business.itemForm.field.title': '标题',
  'business.itemForm.field.description': '描述',
  'business.itemForm.field.priority': '优先级',
  'business.itemForm.field.priorityPlaceholder': '请选择优先级',
  'business.itemForm.field.project': '目标项目',
  'business.itemForm.field.projectPlaceholder': '请选择目标项目',
  'business.itemForm.field.owner': '负责人',
  'business.itemForm.field.ownerPlaceholder': '请选择负责人',
  'business.itemForm.field.dueAt': '截止时间',
  'business.itemForm.field.estimatedHours': '预估工时',
  'business.itemForm.field.note': '说明',

  // ── 评论条目（CommentItem）────────────────────────────────────────
  'business.comment.unknownMember': '未知成员',
  'business.comment.mine': '我',
  'business.comment.decision': '关键决策',

  // ── 日期 / 时间字段（DateTimeField）────────────────────────────────
  'business.dateTimeField.placeholder': '请选择',
  'business.dateTimeField.today': '今天 ',
  'business.dateTimeField.tomorrow': '明天 ',
  'business.dateTimeField.clear': '清除',

  // ── 选择抽屉（PickerSheet）────────────────────────────────────────
  'business.picker.clear': '清除',

  // ── 附件上传抽屉（AttachmentUploadSheet）──────────────────────────
  'business.attachment.title': '添加附件',
  'business.attachment.hint': '单文件 ≤20MB，支持图片 / PDF / Office 文档 / ZIP',
  'business.attachment.entry.camera.title': '拍照',
  'business.attachment.entry.camera.subtitle': '调起系统相机拍摄照片',
  'business.attachment.entry.library.title': '从相册选择',
  'business.attachment.entry.library.subtitle': '从系统相册选取图片',
  'business.attachment.entry.document.title': '选择文件',
  'business.attachment.entry.document.subtitle': 'PDF / Office / ZIP，单文件 ≤20MB',
  'business.attachment.mockTitle': '演示文件',
  'business.attachment.mockA11y': '选择文件 {name}',
  'business.attachment.permission.camera':
    '相机权限已被关闭 —— 需要在系统设置中开启「相机」权限后才能拍照。',
  'business.attachment.permission.library':
    '相册权限已被关闭 —— 需要在系统设置中开启「相册」权限后才能选择图片。',
  'business.attachment.readFailed': '未能读取所选文件，请重新选择',
  'business.attachment.uploading': '上传中…',
  'business.attachment.uploadingPercent': '上传中… {percent}%',
  'business.attachment.openSettings': '去系统设置',
} as const
