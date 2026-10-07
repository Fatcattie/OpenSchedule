/**
 * 职责：en 字典 —— 全局通用词域（增量 12 · L0 · T01 独占）。
 *
 * ★ 键集合必须与 `zh/common.ts` **完全一致**（由 `en/index.ts` 的
 *   `Record<TranslationKey, string>` 在编译期强制：漏键 / 多键均为编译错误）。
 */

/** 全局通用词（英文） */
export const common = {
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.ok': 'OK',
  'common.save': 'Save',
  'common.submit': 'Submit',
  'common.create': 'Create',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.retry': 'Retry',
  'common.refresh': 'Refresh',
  'common.loading': 'Loading…',
  'common.submitting': 'Submitting…',
  'common.processing': 'Processing…',
  'common.done': 'Done',
  'common.search': 'Search',
  'common.more': 'More',
  'common.all': 'All',
  'common.none': 'None',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.required': 'Required',
  'common.optional': 'Optional',
  'common.empty': 'No data',
  'common.emptyHint': 'Nothing here yet',
  'common.loadFailed': 'Failed to load, please retry',
  'common.networkError': 'Network error, please try again later',
  'common.unknownError': 'Operation failed, please try again later',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
}
