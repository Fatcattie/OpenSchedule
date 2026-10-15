/**
 * 职责：en 字典 —— 业务组件域（增量 12 · L6 · T04 填充）。
 *
 * 键集合须与 `zh/business.ts` **完全一致**（漏键 / 多键均为编译错误，见 `en/index.ts`
 * 的 `Record<TranslationKey, string>` 约束）。
 */

/** 业务组件词条（T04 填充） */
export const business = {
  // ── Task card (TaskCard) ────────────────────────────────────────────
  'business.taskCard.overdue': 'Overdue by {days} days',
  'business.taskCard.dueToday': 'Due today',
  'business.taskCard.dueTomorrow': 'Due tomorrow',
  'business.taskCard.unassigned': 'Unassigned',

  // ── Project card (ProjectCard) ──────────────────────────────────────
  'business.projectCard.deadline': 'Due {date}',
  'business.projectCard.overdue': 'Overdue by {days} days',
  'business.projectCard.remaining': '{days} days left',
  'business.projectCard.noOwner': 'No owner',
  'business.projectCard.taskCount': '{count} tasks',

  // ── Form skeleton (ItemForm) ────────────────────────────────────────
  'business.itemForm.banner.manager': 'Will be created directly, no review needed',
  'business.itemForm.submit.create': 'Create',
  'business.itemForm.submit.directCreate': 'Create directly',
  'business.itemForm.submit.submit': 'Submit',
  'business.itemForm.kind.project': 'Project',
  'business.itemForm.kind.task': 'Task',
  'business.itemForm.field.title': 'Title',
  'business.itemForm.field.description': 'Description',
  'business.itemForm.field.priority': 'Priority',
  'business.itemForm.field.priorityPlaceholder': 'Select priority',
  'business.itemForm.field.project': 'Target project',
  'business.itemForm.field.projectPlaceholder': 'Select a target project',
  'business.itemForm.field.owner': 'Owner',
  'business.itemForm.field.ownerPlaceholder': 'Select an owner',
  'business.itemForm.field.dueAt': 'Due date',
  'business.itemForm.field.estimatedHours': 'Estimated hours',
  'business.itemForm.field.note': 'Note',

  // ── Comment item (CommentItem) ──────────────────────────────────────
  'business.comment.unknownMember': 'Unknown member',
  'business.comment.mine': 'Me',
  'business.comment.decision': 'Key decision',

  // ── Date / time field (DateTimeField) ───────────────────────────────
  'business.dateTimeField.placeholder': 'Select',
  'business.dateTimeField.today': 'Today ',
  'business.dateTimeField.tomorrow': 'Tomorrow ',
  'business.dateTimeField.clear': 'Clear',

  // ── Picker sheet (PickerSheet) ──────────────────────────────────────
  'business.picker.clear': 'Clear',

  // ── Attachment upload sheet (AttachmentUploadSheet) ─────────────────
  'business.attachment.title': 'Add attachment',
  'business.attachment.hint': 'Single file ≤20MB; images / PDF / Office docs / ZIP',
  'business.attachment.entry.camera.title': 'Take photo',
  'business.attachment.entry.camera.subtitle': 'Open the system camera to take a photo',
  'business.attachment.entry.library.title': 'Choose from library',
  'business.attachment.entry.library.subtitle': 'Pick an image from the system library',
  'business.attachment.entry.document.title': 'Choose file',
  'business.attachment.entry.document.subtitle': 'PDF / Office / ZIP, single file ≤20MB',
  'business.attachment.mockTitle': 'Demo files',
  'business.attachment.mockA11y': 'Choose file {name}',
  'business.attachment.permission.camera':
    'Camera permission is off — enable Camera in system settings to take photos.',
  'business.attachment.permission.library':
    'Photo library permission is off — enable Photos in system settings to choose images.',
  'business.attachment.readFailed': 'Could not read the selected file, please choose again',
  'business.attachment.uploading': 'Uploading…',
  'business.attachment.uploadingPercent': 'Uploading… {percent}%',
  'business.attachment.openSettings': 'Open settings',
}
