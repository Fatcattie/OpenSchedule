/// <reference types="jest" />
/**
 * 职责：zh **零回归冻结守卫**（抽样版，增量 12 · 批次 3 · T05 收口 · `M-P2-05-15`）。
 *
 * 目的：把「改造前源码中的中文字面串」冻结为断言，防止 i18n 迁移过程中 zh 取值被悄悄改写
 * （既有 ≈216 处中文断言的前提是 zh 逐字不变）。
 *
 * 覆盖：
 *  ① **抽样冻结**：`common` + 从 `nav` / `ui` / `screens.core` / `screens.more` / `business` /
 *     `services` 各域抽 2–3 条**当前实际值**，断言 `zh[key] === 冻结字面量`；
 *  ② **派生一致性**：`zh['taskStatus.*'] === lightStatusColor[*].label`（6 条），证明「zh 值同源派生、
 *     零漂移」（§2.9 F6）；
 *  ③ 抽样覆盖 `services.networkOffline`（**若存在**，否则跳过，不写会红的断言）。
 *
 * 说明：本文件**只断言既有 zh 取值**，不修改任何源码 / 常量；`lightStatusColor` 的取值冻结由
 *       `theme-contrast.test.ts` 独立守卫，此处仅验证「字典 ← 常量」单向派生未漂移。
 */

import { zh } from '@/i18n'
import { lightStatusColor } from '@/theme/semantic'

/** 便于按动态键索引（`zh` 为 `as const`，动态键需放宽为 Record 读） */
const zhMap = zh as Record<string, string>

// ────────────────────────────────────────────────────────────────
// ① 抽样冻结
// ────────────────────────────────────────────────────────────────
describe('zh 冻结守卫 —— 抽样字面量', () => {
  it('common：确认 / 取消 / 重试 逐字冻结', () => {
    expect(zh['common.confirm']).toBe('确认')
    expect(zh['common.cancel']).toBe('取消')
    expect(zh['common.retry']).toBe('重试')
  })

  it('nav：底部 Tab 与冷启动品牌态逐字冻结', () => {
    expect(zh['nav.tab.workspace']).toBe('工作台')
    expect(zh['nav.tab.me']).toBe('我的')
    expect(zh['nav.boot.restoring']).toBe('正在恢复会话…')
  })

  it('ui：语言区块与错误态逐字冻结', () => {
    expect(zh['profile.language.title']).toBe('语言')
    expect(zh['profile.language.system']).toBe('跟随系统')
    expect(zh['component.error.title']).toBe('加载失败')
  })

  it('screens.core：登录 / 今日聚焦 / 关于 逐字冻结', () => {
    expect(zh['screens.core.login.submit']).toBe('登录')
    expect(zh['screens.core.today.title']).toBe('今日聚焦')
    expect(zh['screens.core.about.title']).toBe('关于')
  })

  it('screens.more：时间容器 / 通知 / 个人计划 逐字冻结', () => {
    expect(zh['screen.calendar.title']).toBe('时间容器')
    expect(zh['screen.notifications.title']).toBe('通知')
    expect(zh['screen.plan.title']).toBe('个人计划')
  })

  it('business：附件抽屉 / 任务卡 / 选择抽屉 逐字冻结', () => {
    expect(zh['business.attachment.title']).toBe('添加附件')
    expect(zh['business.taskCard.dueToday']).toBe('今天到期')
    expect(zh['business.picker.clear']).toBe('清除')
  })

  it('services：HTTP 兜底 / 生物识别提示 / 网络失败 逐字冻结', () => {
    expect(zh['http.401']).toBe('登录已过期，请重新登录')
    expect(zh['auth.biometricPrompt']).toBe('验证身份以解锁 OpenSchedule')
    expect(zh['network.failed']).toBe('网络连接失败，请检查网络后重试')
  })

  it('③ services.networkOffline（若存在则冻结非空，否则跳过）', () => {
    if ('services.networkOffline' in zhMap) {
      expect(zhMap['services.networkOffline']).toBeTruthy()
      expect(zhMap['services.networkOffline'].length).toBeGreaterThan(0)
    } else {
      // 当前字典无此键 ⇒ 跳过（不写会红的断言）
      expect('services.networkOffline' in zhMap).toBe(false)
    }
  })
})

// ────────────────────────────────────────────────────────────────
// ② 派生一致性（zh ← lightStatusColor，单向、零漂移）
// ────────────────────────────────────────────────────────────────
describe('zh 冻结守卫 —— 派生一致性（同源派生零漂移）', () => {
  it('6 条任务状态 zh 值 === lightStatusColor[*].label', () => {
    expect(zh['taskStatus.todo']).toBe(lightStatusColor.todo.label)
    expect(zh['taskStatus.in_progress']).toBe(lightStatusColor.in_progress.label)
    expect(zh['taskStatus.blocked']).toBe(lightStatusColor.blocked.label)
    expect(zh['taskStatus.done']).toBe(lightStatusColor.done.label)
    expect(zh['taskStatus.cancelled']).toBe(lightStatusColor.cancelled.label)
    expect(zh['taskStatus.pending_review']).toBe(lightStatusColor.pending_review.label)
  })

  it('看板列 zh 值 === lightStatusColor[*].label（5 列同源）', () => {
    expect(zh['boardColumn.todo']).toBe(lightStatusColor.todo.label)
    expect(zh['boardColumn.in_progress']).toBe(lightStatusColor.in_progress.label)
    expect(zh['boardColumn.blocked']).toBe(lightStatusColor.blocked.label)
    expect(zh['boardColumn.pending_review']).toBe(lightStatusColor.pending_review.label)
    expect(zh['boardColumn.done']).toBe(lightStatusColor.done.label)
  })
})
