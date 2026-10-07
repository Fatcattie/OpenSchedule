/**
 * 职责：zh 字典 —— 服务层 / 工具层域（增量 12 · L7 · T05 填充）。
 *
 * 覆盖：`http.*`（HTTP 兜底）· `network.*` · `error.*` · `auth.*` · `biometric.*` · `project.*` ·
 * `aiProposal.*` · `notification.*` · `personalTask.*` · `task.*` · `submission.*` · `attachment.*` ·
 * `attachmentServer.*` · `audit.*`（mock 服务层生成的团队动态文案）· `notif.*`（mock 服务层生成的
 * 站内通知标题 / 正文）· `reviewView.*`（待我审核分叉视图）。
 *
 * ⚠️ 本域所有 zh 值**逐字节等于改造前源码内字面串** ⇒ `getCurrentLocale()` 默认 `'zh-CN'` 时
 * 既有服务层 / 工具层测试的中文断言**零改动仍绿**。
 *
 * ⚠️ 取词点一律走 `translate(getCurrentLocale(), …)` / `translateCurrent(…)`（函数体内调用）。
 */

/** 服务层 / 工具层词条（键 = 点分命名空间；en 键集合由 `TranslationKey` 编译期强制一致） */
export const services = {
  // ── HTTP 状态码兜底（原 `HTTP_DEFAULT_MESSAGE`，`services/client.ts`）─────────
  'http.400': '请求参数有误',
  'http.401': '登录已过期，请重新登录',
  'http.403': '没有权限执行该操作',
  'http.404': '资源不存在或不可见',
  'http.409': '状态冲突，请刷新后重试',
  'http.429': '请求过于频繁，请稍后再试',
  'http.500': '服务器内部错误',
  'http.502': 'AI 服务暂不可用',
  'http.503': '服务暂不可用，请稍后再试',
  /** 未命中具体状态码时的通用兜底 */
  'http.default': '请求失败，请稍后重试',
  /** 业务码非 0 且后端未返回 message 时的兜底 */
  'http.businessFailed': '请求失败',

  // ── 网络层（`services/client.ts`）──────────────────────────────────────────
  'network.failed': '网络连接失败，请检查网络后重试',
  /** 离线整屏错误态文案（原 `NETWORK_OFFLINE_MESSAGE`，`types/api.ts`；增量 12 · T03b 收口） */
  'networkOffline': '当前无网络连接，请检查网络后重试',

  // ── 通用错误文案（`types/api.ts`）─────────────────────────────────────────
  'error.failedWithCode': '请求失败（{code}）',

  // ── 认证（`services/auth.service.ts`）─────────────────────────────────────
  'auth.invalidCredentials': '账号或密码不正确，请重新输入',
  'auth.biometricPrompt': '验证身份以解锁 OpenSchedule',

  // ── 生物识别（`services/platform/biometrics*.ts`）─────────────────────────
  'biometric.generic': '生物识别',
  'biometric.face': '面容解锁',
  'biometric.fingerprint': '指纹解锁',
  'biometric.cancel': '改用密码',

  // ── 项目（`services/project.service.ts`）──────────────────────────────────
  'project.notFound': '项目不存在或不可见',

  // ── 聚焦域（`services/focus.service.ts`）──────────────────────────────────
  'aiProposal.notFound': 'AI 提议不存在或已过期',
  'aiProposal.alreadyHandled': '该提议已被处理，已为你刷新最新状态',
  'notification.notFound': '通知不存在',
  'notification.preferenceNotFound': '通知偏好不存在',
  'personalTask.notFound': '个人任务不存在',
  'timeEntry.notFound': '计时记录不存在',

  // ── 任务域（`services/task.service.ts`）───────────────────────────────────
  'task.notFound': '任务不存在或不可见',
  'task.versionConflict': '任务已被他人更新，已为你刷新最新数据',
  'task.illegalTransition': '该状态迁移不被允许，请刷新后重试',
  'submission.illegalTransition': '提报状态迁移不被允许',
  'submission.notFound': '提报不存在或不可见',
  'submission.withdrawEntryOnly': '该入口仅用于撤回新事项提报',
  'submission.withdrawOwnOnly': '只能撤回本人的提报',
  'submission.withdrawPendingOnly': '仅待审核的提报可撤回',
  'submission.withdrawCompletionPendingOnly': '仅待审核的完成提报可撤回',
  'submission.withdrawCompletionOwnOnly': '只能撤回本人提交的完成提报',
  'submission.rejectReasonTooShort': '驳回原因不少于 {min} 字',
  'attachment.readFailed': '未能读取所选文件内容，请重新选择',
  'review.reasonFallback': '未填写驳回原因',
  'review.subtaskTitle': '项目评审 — {title}',
  /** 卡片三枚审批动作的 accessibilityLabel（原 `REVIEW_ACTION_A11Y`，`utils/audit.ts`；T03b 收口） */
  'reviewA11y.approve': '审核通过',
  'reviewA11y.reject': '审核不通过',
  'reviewA11y.rework': '审核退回重改',
  /** 审计 / 留痕的「系统」操作人兜底名 */
  'common.systemActor': '系统',
  /** 评论作者缺失时的兜底名 */
  'common.someone': '有人',

  // ── 团队动态（mock 服务层生成，`task.service.ts` pushAudit）────────────────
  'audit.claim': '承接了「{title}」',
  'audit.move': '将「{title}」由 {from} 变更为 {to}{reason}',
  'audit.reasonSuffix': '（原因：{reason}）',
  'audit.complete': '完成了「{title}」',
  'audit.completeWithSummary': '完成了「{title}」：{summary}',
  'audit.reopen': '重开了「{title}」（原因：{reason}）',
  'audit.undo': '撤销了对「{title}」的完成操作{reason}',
  'audit.undoReasonSuffix': '（{reason}）',
  'audit.comment': '{author}在「{title}」中发表了评论',
  'audit.attachment': '上传了附件「{name}」',
  'audit.timeStart': '开始为「{title}」计时',
  'audit.timeStop': '结束「{title}」计时',
  'audit.taskCreate': '创建了任务「{title}」',
  'audit.submissionDirect': '直接创建了「{title}」',
  'audit.submissionCreate': '提报了「{title}」，等待审核',
  'audit.submissionWithdraw': '撤回了「{title}」的提报',
  'audit.withdrawCompletion': '撤回了「{title}」的完成提报{reason}',
  'audit.approveCompletion': '通过了「{title}」的完成提报',
  'audit.approveSubmission': '通过了「{title}」的提报，已落地为正式事项',
  'audit.rejectRework': '退回了「{title}」的提报',
  'audit.reject': '驳回了「{title}」的提报',

  // ── 站内通知（mock 服务层生成，`task.service.ts` pushNotification）────────
  'notif.reviewPendingTitle': '待你审核',
  'notif.reviewPendingBody': '「{title}」已完成提报，等待你的审核',
  'notif.resultApprovedTitle': '提报已通过',
  'notif.completionApprovedBody': '你提交的「{title}」已完成提报',
  'notif.submissionApprovedBody': '你的提报「{title}」已通过审核',
  'notif.reworkedTitle': '提报已退回重改',
  'notif.rejectedTitle': '提报已驳回',
  'notif.reworkedBody': '你的提报「{title}」被退回重改：{reason}',
  'notif.rejectedBody': '你的提报「{title}」被驳回：{reason}',
  'notif.withdrawnTitle': '提报已撤回',
  'notif.withdrawnBody': '「{title}」的完成提报已被提报人撤回，无需审核',
  'notif.mentionTitle': '{author} 在任务《{title}》中提到了你',
  'notif.reviewSubtaskTitle': '待你评审',
  'notif.reviewSubtaskBody': '「{title}」已完成提报，请进行项目评审',

  // ── 提报校验 / 待审视图（`utils/submission.ts`）────────────────────────────
  'submission.titleRequired': '请填写事项标题',
  'reviewView.completionLabel': '完成待审',
  'reviewView.completionAction': '提交了完成提报',
  'reviewView.projectLabel': '提报待审 · 新项目',
  'reviewView.taskLabel': '提报待审 · 新任务',
  'reviewView.projectAction': '提报了新项目',
  'reviewView.taskAction': '提报了新任务',

  // ── 附件校验（`utils/attachment.ts`）──────────────────────────────────────
  'attachment.emptyName': '文件名不能为空',
  'attachment.invalidSize': '文件大小无效，请重新选择文件',
  'attachment.tooLarge': '文件大小超出限制：最大 20MB，当前 {current}',
  'attachment.unsupportedType': '不支持的文件类型：{mime}，仅支持图片、PDF、文本、Office 文档与 ZIP',
  'attachment.unknownMime': '未知',

  // ── 服务端可接收性预检（`utils/attachmentServerPolicy.ts`）─────────────────
  'attachmentServer.textRejected': '文本类附件暂不支持上传（服务端仅收图片 / PDF / Office / ZIP）',
  'attachmentServer.textHint': '可先另存为 PDF 后再上传',
  'attachmentServer.videoRejected': '暂不支持视频附件',
  'attachmentServer.imageRejected': '暂不支持该图片格式（仅支持 JPEG/PNG/GIF/WebP/HEIC）',
  'attachmentServer.imageHint': '可在相册中另存为 JPEG 后重选',
  'attachmentServer.executableRejected': '不支持上传可执行程序文件',
  'attachmentServer.unknownRejected': '无法识别的文件类型',
} as const
