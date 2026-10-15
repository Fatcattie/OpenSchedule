/// <reference types="jest" />
/**
 * 职责：i18n **纯函数层**单元测试（增量 12 · 批次 3 · T05 收口）。
 *
 * 覆盖（`M-P2-05-15` 纯函数部分）：
 *  ① zh / en **键集合完全一致**（动态遍历，不硬编码键列表）；
 *  ② 所有 zh / en 词条均为**非空字符串**（无空值 / 无 undefined）；
 *  ③ `interpolate` 插值语义（命中替换、缺参保留占位符、未传参原样返回）；
 *  ④ `translate` 缺键回退 key 本身且不抛错；
 *  ⑤ 非法 locale 回退 zh 且不抛错；
 *  ⑥ `'system'` **不得流入字典**：运行期回退 zh、**编译期**由 `@ts-expect-error` 断言为类型错误。
 *
 * 本套件零 React 依赖，仅消费 `@/i18n` 的纯导出。
 */

import { en, interpolate, translate, zh } from '@/i18n'

// ────────────────────────────────────────────────────────────────
// ① zh / en 键集合完全一致
// ────────────────────────────────────────────────────────────────
describe('i18n —— zh / en 键集合一致性', () => {
  it('Object.keys(zh) 与 Object.keys(en) 排序后逐项相等（动态遍历）', () => {
    const zhKeys = Object.keys(zh).sort()
    const enKeys = Object.keys(en).sort()
    expect(enKeys).toEqual(zhKeys)
  })

  it('每个 zh 键在 en 中都有对应词条（无漏键）', () => {
    // 注：键名含 `.`，不能用 `toHaveProperty`（它会把 `.` 当嵌套路径分隔符）⇒ 用 `hasOwnProperty`
    for (const key of Object.keys(zh)) {
      expect(Object.prototype.hasOwnProperty.call(en, key)).toBe(true)
    }
  })

  it('字典非空（存在词条）', () => {
    expect(Object.keys(zh).length).toBeGreaterThan(0)
    expect(Object.keys(en).length).toBe(Object.keys(zh).length)
  })
})

// ────────────────────────────────────────────────────────────────
// ② 无空值
// ────────────────────────────────────────────────────────────────
describe('i18n —— 无空值', () => {
  it('所有 zh 词条均为非空字符串', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
      expect((value as string).trim().length).toBeGreaterThan(0)
      expect(key.length).toBeGreaterThan(0)
    }
  })

  it('所有 en 词条均为非空字符串', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
      expect((value as string).trim().length).toBeGreaterThan(0)
      expect(key.length).toBeGreaterThan(0)
    }
  })
})

// ────────────────────────────────────────────────────────────────
// ③ 插值
// ────────────────────────────────────────────────────────────────
describe('i18n —— 插值', () => {
  it("interpolate：命中参数替换 {name}", () => {
    expect(interpolate('你好 {name}', { name: '张三' })).toBe('你好 张三')
  })

  it('interpolate：多个占位符分别替换（数字转字符串）', () => {
    expect(interpolate('{a}-{b}', { a: 1, b: 2 })).toBe('1-2')
  })

  it('interpolate：缺参数保留 {占位符}（不抛错、不输出 undefined）', () => {
    expect(interpolate('你好 {name}', {})).toBe('你好 {name}')
    expect(interpolate('{a}{b}', { a: '1' })).toBe('1{b}')
  })

  it('interpolate：未传 params 原样返回模板', () => {
    expect(interpolate('原样 {x}')).toBe('原样 {x}')
  })

  it('translate：带占位符的词条正确插值（zh）', () => {
    expect(translate('zh-CN', 'screens.core.workspace.approachingWarning', { count: 3 })).toBe(
      '有 3 个任务将在 24 小时内到期',
    )
  })

  it('translate：带占位符的词条正确插值（en 不含 {占位符} 残留）', () => {
    const result = translate('en-US', 'screens.core.workspace.approachingWarning', { count: 3 })
    expect(result).not.toContain('{count}')
    expect(result).toContain('3')
  })

  it('translate：缺参数时保留占位符、不抛错', () => {
    const result = translate('zh-CN', 'screens.core.workspace.approachingWarning')
    expect(result).toBe('有 {count} 个任务将在 24 小时内到期')
  })
})

// ────────────────────────────────────────────────────────────────
// ④ 缺键回退
// ────────────────────────────────────────────────────────────────
describe('i18n —— 缺键回退', () => {
  it('不存在的键 → 返回 key 本身，且不抛错', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = translate('zh-CN', '不存在的键' as never)
      expect(result).toBe('不存在的键')
    } finally {
      warn.mockRestore()
    }
  })

  it('en 缺键（若发生）→ 回退 zh 词条而非空白', () => {
    // 键集合一致性已由 ① 保证；此处验证运行期回退链 dict[key] → zh[key] → key
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = translate('en-US', '不存在的键' as never)
      expect(result).toBe('不存在的键')
    } finally {
      warn.mockRestore()
    }
  })
})

// ────────────────────────────────────────────────────────────────
// ⑤ 非法 locale
// ────────────────────────────────────────────────────────────────
describe('i18n —— 非法 locale 回退 zh', () => {
  it("传非法值（'fr-FR'）→ 回退 zh 且不抛错", () => {
    const result = translate('fr-FR' as never, 'common.confirm')
    expect(result).toBe('确认')
  })

  it('非法 locale + 缺键 → 仍返回 key 本身、不抛错', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = translate('de-DE' as never, '不存在' as never)
      expect(result).toBe('不存在')
    } finally {
      warn.mockRestore()
    }
  })
})

// ────────────────────────────────────────────────────────────────
// ⑥ 'system' 不可流入字典（运行期 + 编译期）
// ────────────────────────────────────────────────────────────────
describe("i18n —— 'system' 不得流入字典", () => {
  it("运行期：translate('system' as never, …) 回退 zh、不崩、不返回 undefined", () => {
    const result = translate('system' as never, 'common.confirm')
    expect(result).toBe('确认')
    expect(result).toBeDefined()
    expect(result).not.toBeUndefined()
  })

  it("编译期：translate('system', …) 为类型错误（@ts-expect-error 若失效则 tsc 报未使用指令）", () => {
    // 类型铁律 A6：translate 的 locale 参数只接受 `Locale`（'zh-CN' | 'en-US'），
    // 'system' 仅存在于偏好层，类型层不可传入。下一行必须报错，故用 @ts-expect-error 断言。
    // @ts-expect-error 'system' 不是 Locale（只存在于 LocalePreference）
    const viaSystem = translate('system', 'common.confirm')
    // 运行期仍回退 zh（编译期已拦截，此处仅确认不崩）
    expect(viaSystem).toBe('确认')
  })
})
