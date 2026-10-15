/**
 * 职责：QA 独立回归 —— 「全局设计语言升级：圆角尺度上调 + 交互动效丝滑化」。
 *
 * 覆盖范围（对应 QA 任务 #68 的验收基准）：
 *  ① 设计 token 关键数值（radius / shadow / motion）—— 防止未来被误改回旧值；
 *  ② `usePressScale` 已从 timing 切换到 spring，读取 `motion.spring.press`，对外 API 不变；
 *  ③ `PressableScale` 契约：onPressIn / onPressOut 合并调用、disabled 透传、pressedBg 生效、style 作用于自身；
 *  ④ 导航转场静态守卫（stacks / MainTabs）与全仓红线静态审计（无第三方动效依赖 / 无硬编码圆角 / 无裸 Pressable 残留）。
 *
 * 独立性：本文件不修改任何既有套件，也不修改源码；全部为「数值 / 行为」断言，**不使用渲染快照**。
 */
import fs from 'fs'
import path from 'path'
import { Animated, StyleSheet, Text, type GestureResponderEvent } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { motion, radius, shadow } from '@/theme'
import { EMPTY_VIEW_STYLE, usePressScale, type UsePressScaleResult } from '@/hooks/usePressScale'
import { PressableScale } from '@/components/PressableScale'

const SRC = path.join(__dirname, '..', 'src')
const FAKE_EVENT = {} as GestureResponderEvent

/** 读取 src 下相对路径源码文本（用于导航 / 红线静态守卫） */
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
// ① 设计 token 尺度
// ────────────────────────────────────────────────────────────────
describe('QA · 设计 token 尺度（radius / shadow / motion）', () => {
  it('radius 五档逐项匹配（整体上调一档，pill 仍为完全胶囊）', () => {
    expect(radius).toEqual({ sm: 12, control: 16, card: 20, sheet: 28, pill: 999 })
  })

  it('shadow.card 匹配（更淡更大 + 更低 elevation）', () => {
    expect(shadow.card).toMatchObject({
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    })
  })

  it('shadow.raised 匹配（底部操作条 / 抽屉）', () => {
    expect(shadow.raised).toMatchObject({
      shadowOpacity: 0.08,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: -6 },
      elevation: 8,
    })
  })

  it('shadow.floating 匹配（FAB）', () => {
    expect(shadow.floating).toMatchObject({
      shadowOpacity: 0.14,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    })
  })

  it('motion.duration 四档逐项匹配', () => {
    expect(motion.duration).toEqual({ instant: 100, fast: 140, base: 240, slow: 340 })
  })

  it('motion 错峰 / 入场位移逐项匹配', () => {
    expect(motion.stagger).toBe(45)
    expect(motion.staggerMax).toBe(7)
    expect(motion.enterOffset).toBe(12)
  })

  it('motion.spring.press 存在且三参数正确（本次新增）', () => {
    expect(motion.spring.press).toEqual({ damping: 18, stiffness: 320, mass: 0.7 })
  })

  it('motion.spring.sheet 保持绵软参数（未被误改）', () => {
    expect(motion.spring.sheet).toEqual({ damping: 24, stiffness: 200, mass: 0.9 })
  })

  it('缓动 standard / decelerate 仍为缓动函数', () => {
    expect(typeof motion.easing.standard).toBe('function')
    expect(typeof motion.easing.decelerate).toBe('function')
  })
})

// ────────────────────────────────────────────────────────────────
// ② usePressScale 行为与对外 API
// ────────────────────────────────────────────────────────────────
let captured: UsePressScaleResult | null = null

/** 探针组件：把 hook 返回值抛出到模块作用域，供断言读取 */
function HookProbe({ to }: { to?: number }): null {
  captured = to === undefined ? usePressScale() : usePressScale(to)
  return null
}

/** 读取探针捕获的 hook 返回值（未捕获则抛错） */
function getResult(): UsePressScaleResult {
  if (!captured) throw new Error('usePressScale 探针未捕获到返回值')
  return captured
}

describe('QA · usePressScale 行为与对外 API', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('返回结构完整：scale / animatedStyle / onPressIn / onPressOut', async () => {
    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe />)
    })
    const r = getResult()
    expect(r).not.toBeNull()
    expect(r.scale).toBeInstanceOf(Animated.Value)
    expect(r.animatedStyle.transform).toHaveLength(1)
    expect(r.animatedStyle.transform[0].scale).toBe(r.scale)
    expect(typeof r.onPressIn).toBe('function')
    expect(typeof r.onPressOut).toBe('function')
  })

  it('按下 / 抬起走 Animated.spring（非 timing），读取 motion.spring.press，默认 to=0.97', async () => {
    const springSpy = jest
      .spyOn(Animated, 'spring')
      .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation)
    const timingSpy = jest.spyOn(Animated, 'timing')

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
      toValue: 0.97,
      damping: motion.spring.press.damping,
      stiffness: motion.spring.press.stiffness,
      mass: motion.spring.press.mass,
      useNativeDriver: true,
    })

    await act(async () => {
      r.onPressOut()
    })
    expect(springSpy).toHaveBeenLastCalledWith(r.scale, expect.objectContaining({ toValue: 1 }))

    // 关键：已从 Animated.timing 切换到 Animated.spring
    expect(timingSpy).not.toHaveBeenCalled()
  })

  it('自定义 to 生效（按下目标为传入值）', async () => {
    const springSpy = jest
      .spyOn(Animated, 'spring')
      .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation)

    captured = null
    await act(async () => {
      TestRenderer.create(<HookProbe to={0.92} />)
    })
    const r = getResult()
    await act(async () => {
      r.onPressIn()
    })
    expect(springSpy.mock.calls[0][1]).toMatchObject({ toValue: 0.92 })
  })

  it('EMPTY_VIEW_STYLE 仍为空对象常量', () => {
    expect(EMPTY_VIEW_STYLE).toEqual({})
  })
})

// ────────────────────────────────────────────────────────────────
// ③ PressableScale 契约
// ────────────────────────────────────────────────────────────────
const BOX = { marginTop: 7, width: 120 }

describe('QA · PressableScale 契约', () => {
  let springSpy: jest.SpyInstance

  beforeEach(() => {
    springSpy = jest
      .spyOn(Animated, 'spring')
      .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  async function mount(element: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(element)
    })
    return renderer
  }

  /**
   * 定位底层 RN Pressable 节点。
   * 注意：`Animated.createAnimatedComponent(Pressable)` 会改变节点 type 身份，
   * 直接 `findByType(Pressable)` 无法命中，故按「带 onPressIn 回调的最内层节点」定位
   * （渲染树中 PressableScale → Animated(Pressable) → Pressable 三层均带 onPressIn）。
   */
  function pressableNode(renderer: TestRenderer.ReactTestRenderer): TestRenderer.ReactTestInstance {
    const matches = renderer.root.findAll((n) => typeof n.props.onPressIn === 'function')
    const node = matches[matches.length - 1]
    if (!node) throw new Error('底层 Pressable 节点未找到')
    return node
  }

  it('onPressIn 合并调用：内部缩放与调用方 handler 均被调用（scale 透传）', async () => {
    const onPressIn = jest.fn()
    const renderer = await mount(
      <PressableScale testID="ps" scale={0.9} onPressIn={onPressIn} style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )
    const node = pressableNode(renderer)

    await act(async () => {
      node.props.onPressIn(FAKE_EVENT)
    })

    expect(onPressIn).toHaveBeenCalledTimes(1) // 调用方 handler 被调用
    expect(onPressIn).toHaveBeenCalledWith(FAKE_EVENT)
    expect(springSpy).toHaveBeenCalledTimes(1) // 内部 press.onPressIn 也被调用
    expect(springSpy.mock.calls[0][1]).toMatchObject({ toValue: 0.9 })

    await act(async () => renderer.unmount())
  })

  it('onPressOut 合并调用：内部回弹与调用方 handler 均被调用', async () => {
    const onPressOut = jest.fn()
    const renderer = await mount(
      <PressableScale testID="ps" onPressOut={onPressOut} style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )
    const node = pressableNode(renderer)

    await act(async () => {
      node.props.onPressOut(FAKE_EVENT)
    })

    expect(onPressOut).toHaveBeenCalledTimes(1)
    expect(springSpy).toHaveBeenCalledTimes(1) // 内部 press.onPressOut 回弹
    expect(springSpy.mock.calls[0][1]).toMatchObject({ toValue: 1 })

    await act(async () => renderer.unmount())
  })

  it('未传 onPressIn / onPressOut 时不报错（可选回调）', async () => {
    const renderer = await mount(
      <PressableScale testID="ps" style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )
    const node = pressableNode(renderer)
    await act(async () => {
      node.props.onPressIn(FAKE_EVENT)
      node.props.onPressOut(FAKE_EVENT)
    })
    expect(springSpy).toHaveBeenCalledTimes(2) // 内部仍生效
    await act(async () => renderer.unmount())
  })

  it('disabled 透传至底层 Pressable', async () => {
    const renderer = await mount(
      <PressableScale testID="ps" disabled style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )
    expect(pressableNode(renderer).props.disabled).toBe(true)
    await act(async () => renderer.unmount())
  })

  it('pressedBg：按下时叠加底色，抬起后消失', async () => {
    const renderer = await mount(
      <PressableScale testID="ps" pressedBg="#EEEEEE" style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )

    const before = StyleSheet.flatten(pressableNode(renderer).props.style) ?? {}
    expect(before.backgroundColor).toBeUndefined()

    await act(async () => {
      pressableNode(renderer).props.onPressIn(FAKE_EVENT)
    })
    const pressed = StyleSheet.flatten(pressableNode(renderer).props.style) ?? {}
    expect(pressed.backgroundColor).toBe('#EEEEEE')

    await act(async () => {
      pressableNode(renderer).props.onPressOut(FAKE_EVENT)
    })
    const released = StyleSheet.flatten(pressableNode(renderer).props.style) ?? {}
    expect(released.backgroundColor).toBeUndefined()

    await act(async () => renderer.unmount())
  })

  it('style 原样作用于 Pressable 自身，缩放 transform 亦在该节点（无外层 View 包裹）', async () => {
    const renderer = await mount(
      <PressableScale testID="ps" style={BOX}>
        <Text>tap</Text>
      </PressableScale>,
    )
    const node = pressableNode(renderer)
    const flat = StyleSheet.flatten(node.props.style) ?? {}

    expect(flat.marginTop).toBe(7)
    expect(flat.width).toBe(120)
    // transform（animatedStyle）直接挂在 Pressable 上 ⇒ 未破坏绝对定位 / flex:1 语义
    expect(Array.isArray(flat.transform)).toBe(true)
    // Animated 已把 scale 解析为数值下发到该 Pressable 节点（初始未按下 = 1）
    expect((flat.transform as { scale: number }[])[0].scale).toBe(1)

    await act(async () => renderer.unmount())
  })
})

// ────────────────────────────────────────────────────────────────
// ④ 导航转场静态守卫
// ────────────────────────────────────────────────────────────────
describe('QA · 导航转场静态守卫', () => {
  const stacks = readSrc('navigation/stacks.tsx')
  const tabs = readSrc('navigation/MainTabs.tsx')

  it('stackScreenOptions 使用 slide_from_right + slow 时长', () => {
    expect(stacks).toContain("animation: 'slide_from_right'")
    expect(stacks).toContain('animationDuration: motion.duration.slow')
  })

  it('AiProposalSheet 的 transparentModal + fade 未被破坏', () => {
    expect(stacks).toContain("presentation: 'transparentModal'")
    expect(stacks).toContain("animation: 'fade'")
  })

  it('MainTabs 使用 shift 过渡', () => {
    expect(tabs).toContain("animation: 'shift'")
  })

  it('MainTabs 5 个 Tab 的图标与中文标题完整保留', () => {
    for (const label of ['工作台', '今日', '项目', '时间', '我的']) {
      expect(tabs).toContain(label)
    }
    for (const icon of ["'home'", "'target'", "'grid'", "'clock'", "'user'"]) {
      expect(tabs).toContain(icon)
    }
  })

  it('MainTabs 选中态图标胶囊引用 radius.control 与 primaryFaint', () => {
    expect(tabs).toContain('radius.control')
    expect(tabs).toContain('colors.primaryFaint')
  })

  /**
   * 回归守卫：TabBar hairline 上边框必须被显式置零。
   *
   * 背景 / 意图：`@react-navigation/bottom-tabs` 的**默认 `tabBarStyle`** 会透传一条 hairline
   * 上边框（`borderTopWidth: 1` + `borderTopColor: colors.border`）。我们做了「去硬直边」
   * 升级（顶部圆角 `radius.sheet` + 上投影 `shadow.raised`）后，一旦**不再覆盖**该默认值，
   * 就会静默回归成「圆角 + 投影 + 1px 硬线」的三重叠加，肉眼可见一道突兀硬边。
   * 因此在此锁死 `borderTopWidth: 0`（且不得出现 `borderTopWidth: 1` 或 `overflow: 'hidden'`）。
   */
  it('MainTabs 的 tabBarStyle 显式置零 hairline 上边框（borderTopWidth: 0）', () => {
    // 1) 必须在 tabBarStyle 对象内出现 borderTopWidth: 0
    const styleBlock = tabs.slice(tabs.indexOf('tabBarStyle: {'), tabs.indexOf('tabBarLabelStyle'))
    expect(styleBlock).toContain('borderTopWidth: 0')
    // 2) 反向守卫：不得残留默认 hairline（1px）或上边框颜色
    expect(styleBlock).not.toContain('borderTopWidth: 1')
    expect(styleBlock).not.toContain('borderTopColor')
    // 3) 硬红线：iOS 上 overflow:'hidden' 会连同层阴影一并裁掉
    expect(tabs).not.toContain("overflow: 'hidden'")
  })

  it('MainTabs 的 tabBarStyle 其余六项外观未被改动', () => {
    const styleBlock = tabs.slice(tabs.indexOf('tabBarStyle: {'), tabs.indexOf('tabBarLabelStyle'))
    expect(styleBlock).toContain('backgroundColor: colors.bg.surface')
    expect(styleBlock).toContain('borderTopLeftRadius: radius.sheet')
    expect(styleBlock).toContain('borderTopRightRadius: radius.sheet')
    expect(styleBlock).toContain('paddingTop: spacing.xxs')
    expect(styleBlock).toContain('height: layout.tabBarHeight')
    expect(styleBlock).toContain('...shadow.raised')
  })
})

// ────────────────────────────────────────────────────────────────
// ④ 全仓红线静态审计
// ────────────────────────────────────────────────────────────────
describe('QA · 全仓红线静态审计', () => {
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
    const pkg = JSON.parse(
      fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(all.filter((k) => /reanimated|gesture-handler/.test(k))).toEqual([])
  })

  it('无硬编码 borderRadius: <数字>（必须引用 radius.* token）', () => {
    const hits = contents.filter(({ text }) => /borderRadius:\s*\d/.test(text)).map(({ f }) => rel(f))
    expect(hits).toEqual([])
  })

  it('无 pressedBg={colors.bg.surface} 残留', () => {
    const hits = contents
      .filter(({ text }) => text.includes('pressedBg={colors.bg.surface}'))
      .map(({ f }) => rel(f))
    expect(hits).toEqual([])
  })

  it('PressableScale 调用点覆盖 ≥ 15 个文件', () => {
    const withCalls = contents.filter(({ text }) => text.includes('<PressableScale')).map(({ f }) => rel(f))
    expect(withCalls.length).toBeGreaterThanOrEqual(15)
  })

  it('裸 <Pressable> 仅剩 6 处刻意跳过项', () => {
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
