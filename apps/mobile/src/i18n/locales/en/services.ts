/**
 * 职责：en 字典 —— 服务层 / 工具层域（增量 12 · L7 · T05 填充）。
 *
 * ★ 键集合必须与 `zh/services.ts` **完全一致**（由 `en: Record<TranslationKey, string>` 编译期强制）。
 * ★ en 值手写英文（zh 侧是改造前源码字面串的单一事实来源，无法同源派生）。
 */

/** 服务层 / 工具层词条（英文） */
export const services = {
  // ── HTTP status fallback（`services/client.ts`）───────────────────────────
  'http.400': 'Invalid request parameters',
  'http.401': 'Your session has expired, please sign in again',
  'http.403': 'You do not have permission to perform this action',
  'http.404': 'The resource does not exist or is not visible',
  'http.409': 'State conflict, please refresh and retry',
  'http.429': 'Too many requests, please try again later',
  'http.500': 'Internal server error',
  'http.502': 'AI service is temporarily unavailable',
  'http.503': 'Service temporarily unavailable, please try again later',
  'http.default': 'Request failed, please try again later',
  'http.businessFailed': 'Request failed',

  // ── Network layer（`services/client.ts`）──────────────────────────────────
  'network.failed': 'Network connection failed, please check your network and retry',
  'networkOffline': 'No network connection currently, please check your network and retry',

  // ── Generic error message（`types/api.ts`）────────────────────────────────
  'error.failedWithCode': 'Request failed ({code})',

  // ── Auth（`services/auth.service.ts`）─────────────────────────────────────
  'auth.invalidCredentials': 'Incorrect account or password, please try again',
  'auth.biometricPrompt': 'Verify your identity to unlock OpenSchedule',
  'auth.biometricFailed': 'Biometric authentication failed. Please sign in with your password.',

  // ── Biometrics（`services/platform/biometrics*.ts`）───────────────────────
  'biometric.generic': 'Biometrics',
  'biometric.face': 'Face unlock',
  'biometric.fingerprint': 'Fingerprint unlock',
  'biometric.cancel': 'Use password',

  // ── Project（`services/project.service.ts`）───────────────────────────────
  'project.notFound': 'Project does not exist or is not visible',

  // ── Focus domain（`services/focus.service.ts`）────────────────────────────
  'aiProposal.notFound': 'AI proposal does not exist or has expired',
  'aiProposal.alreadyHandled': 'This proposal has been handled; the latest state has been refreshed for you',
  'notification.notFound': 'Notification does not exist',
  'notification.preferenceNotFound': 'Notification preference does not exist',
  'personalTask.notFound': 'Personal task does not exist',
  'timeEntry.notFound': 'Time entry does not exist',

  // ── Task domain（`services/task.service.ts`）──────────────────────────────
  'task.notFound': 'Task does not exist or is not visible',
  'task.versionConflict': 'The task was updated by someone else; the latest data has been refreshed for you',
  'task.illegalTransition': 'This status transition is not allowed, please refresh and retry',
  'submission.illegalTransition': 'Submission status transition is not allowed',
  'submission.notFound': 'Submission does not exist or is not visible',
  'submission.withdrawEntryOnly': 'This entry is only for withdrawing new-item submissions',
  'submission.withdrawOwnOnly': 'You can only withdraw your own submission',
  'submission.withdrawPendingOnly': 'Only pending submissions can be withdrawn',
  'submission.withdrawCompletionPendingOnly': 'Only a pending completion submission can be withdrawn',
  'submission.withdrawCompletionOwnOnly': 'You can only withdraw your own completion submission',
  'submission.rejectReasonTooShort': 'Rejection reason must be at least {min} characters',
  'attachment.readFailed': 'Could not read the selected file, please choose again',
  'review.reasonFallback': 'No rejection reason provided',
  'review.subtaskTitle': 'Project review — {title}',
  'reviewA11y.approve': 'Approve',
  'reviewA11y.reject': 'Reject',
  'reviewA11y.rework': 'Return for rework',
  'common.systemActor': 'System',
  'common.someone': 'Someone',

  // ── Team activity（mock service-generated, `task.service.ts` pushAudit）───
  'audit.claim': 'Claimed "{title}"',
  'audit.move': 'Moved "{title}" from {from} to {to}{reason}',
  'audit.reasonSuffix': ' (reason: {reason})',
  'audit.complete': 'Completed "{title}"',
  'audit.completeWithSummary': 'Completed "{title}": {summary}',
  'audit.reopen': 'Reopened "{title}" (reason: {reason})',
  'audit.undo': 'Undid the completion of "{title}"{reason}',
  'audit.undoReasonSuffix': ' ({reason})',
  'audit.comment': '{author} commented on "{title}"',
  'audit.attachment': 'Uploaded attachment "{name}"',
  'audit.timeStart': 'Started timing "{title}"',
  'audit.timeStop': 'Stopped timing "{title}"',
  'audit.taskCreate': 'Created task "{title}"',
  'audit.submissionDirect': 'Created "{title}" directly',
  'audit.submissionCreate': 'Submitted "{title}", pending review',
  'audit.submissionWithdraw': 'Withdrew the submission of "{title}"',
  'audit.withdrawCompletion': 'Withdrew the completion submission of "{title}"{reason}',
  'audit.approveCompletion': 'Approved the completion submission of "{title}"',
  'audit.approveSubmission': 'Approved the submission of "{title}", now published',
  'audit.rejectRework': 'Returned the submission of "{title}" for rework',
  'audit.reject': 'Rejected the submission of "{title}"',

  // ── In-app notifications（mock service-generated, `task.service.ts`）──────
  'notif.reviewPendingTitle': 'Awaiting your review',
  'notif.reviewPendingBody': '"{title}" has been submitted and awaits your review',
  'notif.resultApprovedTitle': 'Submission approved',
  'notif.completionApprovedBody': 'Your completion submission for "{title}" is done',
  'notif.submissionApprovedBody': 'Your submission "{title}" has been approved',
  'notif.reworkedTitle': 'Submission returned for rework',
  'notif.rejectedTitle': 'Submission rejected',
  'notif.reworkedBody': 'Your submission "{title}" was returned for rework: {reason}',
  'notif.rejectedBody': 'Your submission "{title}" was rejected: {reason}',
  'notif.withdrawnTitle': 'Submission withdrawn',
  'notif.withdrawnBody': 'The completion submission of "{title}" was withdrawn by the submitter; no review needed',
  'notif.mentionTitle': '{author} mentioned you in task "{title}"',
  'notif.reviewSubtaskTitle': 'Awaiting your review',
  'notif.reviewSubtaskBody': '"{title}" has been submitted, please perform the project review',

  // ── Submission validation / review view（`utils/submission.ts`）───────────
  'submission.titleRequired': 'Please enter an item title',
  'reviewView.completionLabel': 'Completion pending review',
  'reviewView.completionAction': 'submitted a completion submission',
  'reviewView.projectLabel': 'Submission pending review · New project',
  'reviewView.taskLabel': 'Submission pending review · New task',
  'reviewView.projectAction': 'submitted a new project',
  'reviewView.taskAction': 'submitted a new task',

  // ── Attachment validation（`utils/attachment.ts`）─────────────────────────
  'attachment.emptyName': 'File name cannot be empty',
  'attachment.invalidSize': 'Invalid file size, please choose the file again',
  'attachment.tooLarge': 'File size exceeds the limit: max 20MB, current {current}',
  'attachment.unsupportedType':
    'Unsupported file type: {mime}. Only images, PDF, text, Office documents and ZIP are supported',
  'attachment.unknownMime': 'Unknown',

  // ── Server acceptability precheck（`utils/attachmentServerPolicy.ts`）─────
  'attachmentServer.textRejected':
    'Text attachments are not supported yet (the server only accepts images / PDF / Office / ZIP)',
  'attachmentServer.textHint': 'You can save it as PDF first and then upload',
  'attachmentServer.videoRejected': 'Video attachments are not supported yet',
  'attachmentServer.imageRejected': 'This image format is not supported yet (only JPEG/PNG/GIF/WebP/HEIC)',
  'attachmentServer.imageHint': 'You can save it as JPEG in your album and choose again',
  'attachmentServer.executableRejected': 'Uploading executable files is not supported',
  'attachmentServer.unknownRejected': 'Unrecognized file type',
}
