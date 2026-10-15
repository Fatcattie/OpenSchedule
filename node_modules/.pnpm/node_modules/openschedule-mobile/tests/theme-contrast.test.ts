/// <reference types="jest" />
/**
 * 职责：主题层对比度自检（增量 10 · D6 / §0.2-Q5 / 附录 A + 附录 B）。
 *
 * **权威口径 = `docs/mobile-app/ARCH-mobile-increment-10-darkmode.md` 附录 A / B**，
 * 本文件把附录 A 的每一行对比度结论编码为断言（不另立一套阈值）：
 *  - **深色方案达标（D6）**：正文 ≥4.5、次要 ≥3、状态标签 ≥4.5（`cancelled` 附录 A.2 明确标注 ✅(≥3)）、
 *    主按钮白字 ≥4.5、非文本指示器（优先级色条）≥3、品牌渐变白字 ≥4.5、层级明度差 ≥1.1。
 *  - **浅色零回归冻结（D2）**：`lightColors` / `lightStatusColor` / `lightPriorityColor` 与字面量深比较；
 *    `colors === lightColors`、`tokens.colors === lightColors`（L2 兼容导出未断）。
 *  - **浅色既有偏差登记（附录 B · §9-M1，不修复）**：8 项断言其对比度**低于** D6 阈值，
 *    失败即说明浅色 palette 被改动。
 *
 * 零新增依赖：WCAG 2.1 相对亮度 / 对比度公式在测试内自实现。
 * 纯逻辑、无渲染。
 */
import {
  colors,
  darkColors,
  darkPriorityColor,
  darkStatusColor,
  lightColors,
  lightPriorityColor,
  lightStatusColor,
  tokens,
} from '@/theme'
import type { TaskPriority, TaskStatus } from '@/types'

// ────────────────────────────────────────────────────────────────
// WCAG 2.1 相对亮度与对比度（自实现，零依赖）
// ────────────────────────────────────────────────────────────────
interface Rgb {
  r: number
  g: number
  b: number
}

interface ParsedColor {
  rgb: Rgb
  /** 0..1 */
  alpha: number
}

/** 解析 `#RRGGBB` / `#RRGGBBAA` / `rgb(...)` / `rgba(...)` */
function parseColor(input: string): ParsedColor {
  const text = input.trim()
  if (text.startsWith('#')) {
    const value = text.slice(1)
    if (value.length !== 6 && value.length !== 8) {
      throw new Error(`无法解析的十六进制颜色：${input}`)
    }
    return {
      rgb: {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
      },
      alpha: value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
    }
  }
  const match = /^rgba?\(([^)]+)\)$/i.exec(text)
  if (!match) throw new Error(`无法解析的颜色：${input}`)
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return {
    rgb: { r: parts[0], g: parts[1], b: parts[2] },
    alpha: parts.length >= 4 ? parts[3] : 1,
  }
}

/** 半透明前景按 alpha 合成到不透明背景上 */
function composite(fg: ParsedColor, bg: Rgb): Rgb {
  return {
    r: fg.rgb.r * fg.alpha + bg.r * (1 - fg.alpha),
    g: fg.rgb.g * fg.alpha + bg.g * (1 - fg.alpha),
    b: fg.rgb.b * fg.alpha + bg.b * (1 - fg.alpha),
  }
}

/** sRGB 分量线性化 */
function linearize(channel: number): number {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG 相对亮度 */
function luminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b)
}

/**
 * 对比度 `(L1+0.05)/(L2+0.05)`。
 * 前景若含 alpha，先按背景合成（附录 A 的 `rgba` 描边等即为此场景）。
 */
function contrast(fg: string, bg: string): number {
  const bgParsed = parseColor(bg)
  const fgParsed = parseColor(fg)
  const bgRgb = bgParsed.rgb
  const fgRgb = fgParsed.alpha < 1 ? composite(fgParsed, bgRgb) : fgParsed.rgb
  const l1 = luminance(fgRgb)
  const l2 = luminance(bgRgb)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** 对比度断言（≥ 阈值；失败信息附带实测值，便于定位） */
function expectContrastAtLeast(fg: string, bg: string, min: number): void {
  const ratio = contrast(fg, bg)
  if (ratio < min) {
    throw new Error(`对比度不足：${fg} on ${bg} = ${ratio.toFixed(2)}:1，要求 ≥ ${min}:1`)
  }
  expect(ratio).toBeGreaterThanOrEqual(min)
}

/** 对比度断言（低于阈值；用于浅色既有偏差登记） */
function expectContrastBelow(fg: string, bg: string, max: number): void {
  const ratio = contrast(fg, bg)
  expect(ratio).toBeLessThan(max)
}

// ────────────────────────────────────────────────────────────────
// 自实现公式自检（钉住实现正确性，避免"公式写错导致全绿"）
// ────────────────────────────────────────────────────────────────
describe('WCAG 公式自检', () => {
  it('黑/白对比度 = 21:1；同色 = 1:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })

  it('rgba 半透明前景按背景合成后计算', () => {
    // 白色 0% alpha 合成后 == 背景 ⇒ 1:1
    expect(contrast('rgba(255,255,255,0)', '#0F1626')).toBeCloseTo(1, 5)
    // 白色 100% alpha 合成后 == 纯白
    expect(contrast('rgba(255,255,255,1)', '#0F1626')).toBeCloseTo(
      contrast('#FFFFFF', '#0F1626'),
      5,
    )
  })
})

// ────────────────────────────────────────────────────────────────
// ① 深色方案达标（D6 · 附录 A.4 / A.2 / A.3）
// ────────────────────────────────────────────────────────────────
describe('深色方案对比度达标（D6 · 附录 A）', () => {
  it('正文 text.primary：对 bg.base / bg.surface / bg.subtle ≥4.5', () => {
    expectContrastAtLeast(darkColors.text.primary, darkColors.bg.base, 4.5)
    expectContrastAtLeast(darkColors.text.primary, darkColors.bg.surface, 4.5)
    expectContrastAtLeast(darkColors.text.primary, darkColors.bg.subtle, 4.5)
  })

  it('次要 text.secondary / text.tertiary：对 bg.base / bg.surface ≥3', () => {
    expectContrastAtLeast(darkColors.text.secondary, darkColors.bg.base, 3)
    expectContrastAtLeast(darkColors.text.secondary, darkColors.bg.surface, 3)
    expectContrastAtLeast(darkColors.text.tertiary, darkColors.bg.base, 3)
    expectContrastAtLeast(darkColors.text.tertiary, darkColors.bg.surface, 3)
  })

  it('主按钮白字 text.inverse 对 primary ≥4.5', () => {
    expectContrastAtLeast(darkColors.text.inverse, darkColors.primary, 4.5)
  })

  it('primary 作选中 tint：对 bg.base / bg.surface ≥3', () => {
    expectContrastAtLeast(darkColors.primary, darkColors.bg.base, 3)
    expectContrastAtLeast(darkColors.primary, darkColors.bg.surface, 3)
  })

  it('primarySoft 对 primaryFaint ≥4.5（强调文字 / 容器）', () => {
    expectContrastAtLeast(darkColors.primarySoft, darkColors.primaryFaint, 4.5)
  })

  it('品牌渐变两档白字 ≥4.5', () => {
    expectContrastAtLeast(darkColors.text.inverse, darkColors.brandGradient[0], 4.5)
    expectContrastAtLeast(darkColors.text.inverse, darkColors.brandGradient[1], 4.5)
  })

  it('状态色 success / warning / danger 对 bg.base ≥4.5', () => {
    expectContrastAtLeast(darkColors.success, darkColors.bg.base, 4.5)
    expectContrastAtLeast(darkColors.warning, darkColors.bg.base, 4.5)
    expectContrastAtLeast(darkColors.danger, darkColors.bg.base, 4.5)
  })

  it('层级明度差：bg.surface / primaryFaint 对 bg.base ≥1.1（可见）', () => {
    expectContrastAtLeast(darkColors.bg.surface, darkColors.bg.base, 1.1)
    expectContrastAtLeast(darkColors.primaryFaint, darkColors.bg.base, 1.1)
  })

  /**
   * 状态标签（附录 A.2）：`color` 对其 `bg`。
   * 5 个状态 ≥4.5；`cancelled` 附录 A.2 明确标注「✅(≥3)」（实测 3.93），故按 ≥3 验收。
   */
  it('6 个状态标签文字 / 底：5 个 ≥4.5、cancelled ≥3（附录 A.2 口径）', () => {
    const minByStatus: Record<TaskStatus, number> = {
      todo: 4.5,
      in_progress: 4.5,
      blocked: 4.5,
      done: 4.5,
      cancelled: 3,
      pending_review: 4.5,
    }
    for (const status of Object.keys(darkStatusColor) as TaskStatus[]) {
      const { color, bg } = darkStatusColor[status]
      expectContrastAtLeast(color, bg, minByStatus[status])
    }
  })

  /**
   * 优先级色条（附录 A.3 按 `bg.base`；Team-lead 口径按 `bg.surface`）——两处背景均 ≥3。
   */
  it('4 档优先级色条对 bg.base / bg.surface 均 ≥3', () => {
    for (const priority of Object.keys(darkPriorityColor) as TaskPriority[]) {
      expectContrastAtLeast(darkPriorityColor[priority], darkColors.bg.base, 3)
      expectContrastAtLeast(darkPriorityColor[priority], darkColors.bg.surface, 3)
    }
  })
})

// ────────────────────────────────────────────────────────────────
// ② 浅色零回归冻结（D2 · 附录 A 浅色列 = 现值逐字节）
// ────────────────────────────────────────────────────────────────
describe('浅色 token 冻结（零回归）', () => {
  it('lightColors 逐项等于冻结字面量', () => {
    const frozen = {
      bg: { base: '#F7F8FA', baseWarm: '#FBFAF7', surface: '#FFFFFF', subtle: '#F1F3F7' },
      primary: '#1B2A4A',
      primarySoft: '#2E4470',
      primaryFaint: '#EAEEF5',
      successFaint: '#E9F6F0',
      dangerFaint: '#FBEDED',
      warningFaint: '#FAF4EA',
      text: {
        primary: '#1A1D24',
        secondary: '#6B7280',
        tertiary: '#9AA1AE',
        inverse: '#FFFFFF',
      },
      border: '#ECEEF2',
      borderStrong: '#DDE1E8',
      overlay: 'rgba(27,42,74,0.45)',
      success: '#2F9E6E',
      warning: '#C8871B',
      danger: '#C24A4A',
      brandGradient: ['#1B2A4A', '#2E4470'],
    }
    expect(lightColors).toEqual(frozen)
  })

  it('lightStatusColor 逐项等于冻结字面量', () => {
    const frozen: Record<TaskStatus, { color: string; bg: string; label: string }> = {
      todo: { color: '#6B7280', bg: '#F1F3F7', label: '待办' },
      in_progress: { color: '#2E4470', bg: '#EAEEF5', label: '进行中' },
      blocked: { color: '#C8871B', bg: '#FBF3E2', label: '已阻塞' },
      done: { color: '#2F9E6E', bg: '#E7F5EE', label: '已完成' },
      cancelled: { color: '#9AA1AE', bg: '#F1F3F7', label: '已取消' },
      pending_review: { color: '#C8871B', bg: '#FBF3E2', label: '待评审' },
    }
    expect(lightStatusColor).toEqual(frozen)
  })

  it('lightPriorityColor 逐项等于冻结字面量', () => {
    const frozen: Record<TaskPriority, string> = {
      urgent: '#C24A4A',
      high: '#C8871B',
      medium: '#2E4470',
      low: '#9AA1AE',
    }
    expect(lightPriorityColor).toEqual(frozen)
  })

  it('L2 兼容导出未断：colors 与 tokens.colors 仍指向 lightColors', () => {
    expect(colors).toBe(lightColors)
    expect(tokens.colors).toBe(lightColors)
  })
})

// ────────────────────────────────────────────────────────────────
// ③ 浅色既有偏差登记（附录 B · §9-M1，不修复）
// ────────────────────────────────────────────────────────────────
describe('浅色既有对比度偏差登记（附录 B · 不修复）', () => {
  // 说明：以下 8 项为「改造前既有偏差」，本次不修改浅色色值（D2/N6）。
  // 断言「低于阈值」：一旦某天浅色 palette 被改动导致达标，本组会红 ⇒ 提醒复核。

  it('text.tertiary / bg.base < 3', () => {
    expectContrastBelow(lightColors.text.tertiary, lightColors.bg.base, 3)
  })

  it('success / bg.base < 4.5', () => {
    expectContrastBelow(lightColors.success, lightColors.bg.base, 4.5)
  })

  it('warning / bg.base < 4.5', () => {
    expectContrastBelow(lightColors.warning, lightColors.bg.base, 4.5)
  })

  it('status blocked 文字 / 底 < 4.5', () => {
    expectContrastBelow(lightStatusColor.blocked.color, lightStatusColor.blocked.bg, 4.5)
  })

  it('status done 文字 / 底 < 4.5', () => {
    expectContrastBelow(lightStatusColor.done.color, lightStatusColor.done.bg, 4.5)
  })

  it('status todo 文字 / 底 < 4.5', () => {
    expectContrastBelow(lightStatusColor.todo.color, lightStatusColor.todo.bg, 4.5)
  })

  it('status cancelled 文字 / 底 < 3', () => {
    expectContrastBelow(lightStatusColor.cancelled.color, lightStatusColor.cancelled.bg, 3)
  })

  it('priority.low / bg.surface < 3（附录 B 记于 bg.base，bg.surface 同样 < 3）', () => {
    expectContrastBelow(lightPriorityColor.low, lightColors.bg.surface, 3)
    expectContrastBelow(lightPriorityColor.low, lightColors.bg.base, 3)
  })
})
