/**
 * 职责：zh 字典 —— 全局通用词域（增量 12 · L0 · T01 独占）。
 *
 * 键前缀：`common.*`。本文件由 T01 独占，T02–T05 不写此文件。
 */

/** 全局通用词（确认 / 取消 / 重试 / 加载中 / 空态通用词等） */
export const common = {
  'common.confirm': '确认',
  'common.cancel': '取消',
  'common.ok': '确定',
  'common.save': '保存',
  'common.submit': '提交',
  'common.create': '新建',
  'common.edit': '编辑',
  'common.delete': '删除',
  'common.close': '关闭',
  'common.back': '返回',
  'common.retry': '重试',
  'common.refresh': '刷新',
  'common.loading': '加载中…',
  'common.submitting': '提交中…',
  'common.processing': '处理中…',
  'common.done': '完成',
  'common.search': '搜索',
  'common.more': '更多',
  'common.all': '全部',
  'common.none': '无',
  'common.yes': '是',
  'common.no': '否',
  'common.required': '必填',
  'common.optional': '选填',
  'common.empty': '暂无数据',
  'common.emptyHint': '暂无内容',
  'common.loadFailed': '加载失败，请重试',
  'common.networkError': '网络异常，请稍后重试',
  'common.unknownError': '操作失败，请稍后重试',
  'common.copy': '复制',
  'common.copied': '已复制',
} as const
