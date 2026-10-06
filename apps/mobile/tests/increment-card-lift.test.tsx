/**
 * 职责：QA 独立回归 —— 卡片「按下浮起 / 浮动立体」交互。
 *
 * 覆盖范围：
 *  ① `shadow.cardLift` 数值，并锁死其 `shadowOffset` 与 `shadow.card` 完全相同（方案成立前提）；
 *  ② `motion.lift` 的 offset / scale / hoverRatio / spring 四组值；
 *  ③ `Card.tsx` 源码静态断言（浮动阴影层 + 悬停回调 + Animated.View 包裹 Pressable，且已无 pressScale）；
 *  ④ `useCardLift` 返回结构与行为（结构完整 / useNativeDriver / 悬停不覆盖按下 / enabled=false 恒等）；
 *  ⑤ 全仓红线静态审计（无硬编码圆角 / 无第三方动效依赖 / package.json 未引入动效库 / 裸 Pressable 白名单不变）。
 *
 * 独立性：本文件不修改任何既有套件，也不修改源码；全部为「数值 / 行为 / 源码文本」断言。
 */
import fs from 'fs'
import path from 'path'
import { Animated } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { motion, shadow } from '@/theme'
import { useCardLift, type UseCardLiftResult } from '@/hooks/useCardLift'

const SRC = path.join(__dirname, '..', 'src')
const ROOT = path.join(SRC, '..')

/** 读取 src 下相对路径源码文本 */
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8')
}

/** 递归收集 src 下全部 .ts / .tsx 文件 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

// ────────────────────────────────────────────────────────────────
// ① 设计 token：shadow.cardLift
// ────────────────────────────────────────────────────────────────
describe('QA · 卡片浮起 token（shadow.cardLift / motion.lift）', () => {
  it('shadow.cardLift 数值逐项匹配（更深更大的浮起阴影）', () => {
    expect(shadow.cardLift).toMatchObject({
      shadowColor: '#1B2A4A',
      shadowOpacity: 0.16,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 3 },
      elevation: 10,
    })
  })

  it('前提锁死：shadow.cardLift.shadowOffset 与 shadow.card.shadowOffset 完全相同', () => {
    // 两个阴影必须同心，交叉淡入时才不会看到偏移跳动 —— 这是本方案成立的硬前提。
    expect(shadow.cardLift.shadowOffset).toEqual(shadow.card.shadowOffset)
  })

  it('既有阴影 card / raised / floating 数值未被误改', () => {
    expect(shadow.card).toMatchObject({
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    })
    expect(shadow.raised).toMatchObject({
      shadowOpacity: 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: -6 },
      elevation: 8,
    })
    expect(shadow.floating).toMatchObject({
      shadowOpacity: 0.14,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    })
  })

  it('motion.lift 四组值匹配（offset / scale / hoverRatio / spring）', () => {
    expect(motion.lift.offset).toBe(4)
    expect(motion.lift.scale).toBe(1.015)
    expect(motion.lift.hoverRatio).toBe(0.45)
    expect(motion.lift.spring).toEqual({ damping: 20, stiffness: 260, mass: 0.8 })
  })

  it('motion.spring.press / sheet 保持原值（未被本次改动波及）', () => {
    expect(motion.spring.press).toEqual({ damping: 18, stiffness: 320, mass: 0.7 })
    expect(motion.spring.sheet).toEqual({ damping: 24, stiffness: 200, mass: 0.9 })
  })
})

// ────────────────────────────────────────────────────────────────
// ② Card.tsx 源码静态断言
// ────────────────────────────────────────────────────────────────
describe('QA · Card.tsx 源码静态断言', () => {
  const card = readSrc('components/Card.tsx')

  it('可点分支含浮动阴影层：styles.liftShadow 与 shadow.cardLift', () => {
    expect(card).toContain('styles.liftShadow')
    expect(card).toContain('shadow.cardLift')
  })

  it('可点分支含悬停回调 onHoverIn / onHoverOut', () => {
    expect(card).toContain('onHoverIn')
    expect(card).toContain('onHoverOut')
  })

  it('外层 Animated.View 包裹内层 Pressable（阴影层在其间）', () => {
    const wrapIndex = card.indexOf('<Animated.View style={lift.wrapStyle}>')
    const pressableIndex = card.indexOf('<Pressable')
    const shadowIndex = card.indexOf('styles.liftShadow')
    expect(wrapIndex).toBeGreaterThanOrEqual(0)
    expect(pressableIndex).toBeGreaterThan(wrapIndex)
    // 浮动阴影层在 Pressable 之前声明 ⇒ 绘制在卡片本体之后
    expect(shadowIndex).toBeGreaterThan(wrapIndex)
    expect(shadowIndex).toBeLessThan(pressableIndex)
    expect(card).toContain('</Animated.View>')
  })

  it('已彻底移除 pressScale（prop 与调用点）', () => {
    expect(card).not.toContain('pressScale')
  })

  it('保留一处裸 <Pressable>（白名单前提）', () => {
    expect(/<Pressable[\s>]/.test(card)).toBe(true)
  })

  it('静止态阴影仍为 shadow.card（styles.base 未改）', () => {
    expect(card).toContain('...shadow.card')
  })

  it('浮动阴影层带不透明背景色（iOS 阴影前提）', () => {
    expect(card).toContain('backgroundColor: colors.bg.surface')
  })

  it('TaskCard / ProjectCard 不再传 pressScale', () => {
    expect(readSrc('components/TaskCard.tsx')).not.toContain('pressScale')
    expect(readSrc('components/ProjectCard.tsx')).not.toContain('pressScale')
  })
})

// ────────────────────────────────────────────────────────────────
// ③ useCardLift 结构与行为
// ────────────────────────────────────────────────────────────────
let captured: UseCardLiftResult | null = null

/** 探针组件：把 hook 返回值抛出到模块作用域，供断言读取 */
function HookProbe({ enabled }: { enabled?: boolean }): null {
  captured = enabled === undefined ? useCardLift() : useCardLift(enabled)
  return null
}

/** 读取探针捕获的 hook 返回值（未捕获则抛错） */
function getResult(): UseCardLiftResult {
  if (!captured) throw new Error('useCardLift 探针未捕获到返回值')
  return captured
}

describe('QA · useCardLift 结构与行为', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('返回结构完整：wrapStyle / shadowStyle + 4 个回调', async () => {
    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe />)
    })
    const r = getResult()
    expect(r).not.toBeNull()
    expect(Array.isArray(r.wrapStyle.transform)).toBe(true)
    const transform = r.wrapStyle.transform as { translateY?: unknown; scale?: unknown }[]
    expect(transform).toHaveLength(2)
    expect('translateY' in transform[0]).toBe(true)
    expect('scale' in transform[1]).toBe(true)
    expect(r.shadowStyle.opacity).toBeDefined()
    expect(typeof r.onPressIn).toBe('function')
    expect(typeof r.onPressOut).toBe('function')
    expect(typeof r.onHoverIn).toBe('function')
    expect(typeof r.onHoverOut).toBe('function')
  })

  it('按下 / 抬起 / 悬停均走 Animated.spring 且 useNativeDriver: true，读取 motion.lift.spring', async () => {
    const springSpy = jest
      .spyOn(Animated, 'spring')
      .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation)

    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe />)
    })
    const r = getResult()

    await act(async () => {
      r.onPressIn()
    })
    expect(springSpy).toHaveBeenCalledTimes(1)
    expect(springSpy.mock.calls[0][1]).toMatchObject({
      toValue: 1,
      damping: motion.lift.spring.damping,
      stiffness: motion.lift.spring.stiffness,
      mass: motion.lift.spring.mass,
      useNativeDriver: true,
    })

    await act(async () => {
      r.onPressOut()
    })
    expect(springSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, useNativeDriver: true }),
    )
  })

  it('悬停不得覆盖按下状态（pressedRef 生效）', async () => {
    const springSpy = jest
      .spyOn(Animated, 'spring')
      .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation)

    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe />)
    })
    const r = getResult()

    // 未按下：悬停浮至 hoverRatio
    await act(async () => {
      r.onHoverIn()
    })
    expect(springSpy.mock.calls[0][1]).toMatchObject({ toValue: motion.lift.hoverRatio })

    // 按下后：悬停进入 / 离开都不应改动（不新增 spring 调用）
    await act(async () => {
      r.onPressIn()
    })
    const callsAfterPress = springSpy.mock.calls.length
    await act(async () => {
      r.onHoverIn()
      r.onHoverOut()
    })
    expect(springSpy.mock.calls.length).toBe(callsAfterPress)

    // 抬起后：悬停离开恢复生效
    await act(async () => {
      r.onPressOut()
    })
    await act(async () => {
      r.onHoverOut()
    })
    expect(springSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0 }),
    )
  })

  it('enabled=false：返回恒等样式（translateY 0 / scale 1 / opacity 0）与空回调', async () => {
    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe enabled={false} />)
    })
    const r = getResult()
    expect(r.wrapStyle).toEqual({ transform: [{ translateY: 0 }, { scale: 1 }] })
    expect(r.shadowStyle).toEqual({ opacity: 0 })
    expect(r.onPressIn()).toBeUndefined()
    expect(r.onPressOut()).toBeUndefined()
    expect(r.onHoverIn()).toBeUndefined()
    expect(r.onHoverOut()).toBeUndefined()
  })
})

// ────────────────────────────────────────────────────────────────
// ④ 全仓红线静态审计
// ────────────────────────────────────────────────────────────────
describe('QA · 全仓红线静态审计（浮起改造后）', () => {
  const files = walk(SRC)
  const contents = files.map((f) => ({ f, text: fs.readFileSync(f, 'utf8') }))
  const rel = (f: string): string => path.relative(SRC, f).replace(/\\/g, '/')

  it('无 react-native-reanimated / gesture-handler 引用', () => {
    const hits = contents
      .filter(({ text }) => /react-native-(reanimated|gesture-handler)/.test(text))
      .map(({ f }) => rel(f))
    expect(hits).toEqual([])
  })

  it('package.json 未引入任何动效第三方依赖', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(all.filter((k) => /reanimated|gesture-handler/.test(k))).toEqual([])
  })

  it('无硬编码 borderRadius: <数字>（必须引用 radius.* token）', () => {
    const hits = contents.filter(({ text }) => /borderRadius:\s*\d/.test(text)).map(({ f }) => rel(f))
    expect(hits).toEqual([])
  })

  it('裸 <Pressable> 白名单仍恰好是那 6 个文件', () => {
    const allowed = [
      'components/BottomSheet.tsx',
      'components/Button.tsx',
      'components/Card.tsx',
      'components/ScreenHeader.tsx',
      'components/SegmentedControl.tsx',
      'components/SwipeableRow.tsx',
    ].sort()
    const hits = contents
      .filter(({ f }) => !f.endsWith('PressableScale.tsx') && /<Pressable[\s>]/.test(fs.readFileSync(f, 'utf8')))
      .map(({ f }) => rel(f))
      .sort()
    expect(hits).toEqual(allowed)
  })
})
