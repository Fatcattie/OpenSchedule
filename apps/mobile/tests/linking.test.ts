/**
 * 职责：深链回归测试（BUGFIX 回归保护）—— 直接消费**真实的** linking 配置
 * （`@/navigation/linking`，非测试内副本），覆盖五类契约：
 *   B1 路径解析（getStateFromPath）全量映射表
 *   B2 往返一致性（getPathFromState → getStateFromPath）—— 缺陷核心判据
 *   B3 scheme 前缀（openschedule:// 与 https 前缀）
 *   B4 未知路径的约定行为
 *   B5 旧 URL 契约变更（本次消除冗余段后的预期失效路径）
 *
 * 缺陷根因回顾（首次）：Tabs 下每个 Tab 都是「内嵌 native-stack」，若某 Tab 只写成字符串
 * （如 `Me: 'me'`），URL 生成端会产出 `/me/Profile`，而解析端无子屏配置可匹配，
 * 返回 undefined → 静默回退到初始态（工作台）。修复方式：为每个 Tab 补齐显式嵌套
 * screens。因此 B2「生成 → 再解析回等价状态」是防止该缺陷复发的关键断言。
 *
 * 本次修复（消除冗余段）：把每个 Tab 的根屏 path 置为空字符串 `''`（内层 navigator 的
 * 初始路由不占路径段），多段子屏统一改为 kebab-case 小写。新映射：
 *   /workspace、/today、/projects、/projects/:projectId、/time、/me、
 *   /me/notification-settings、/me/about、/task/:taskId、/notifications
 * 增量 1 追加根栈共享页（与 TaskDetail / Notifications 同级的扁平字符串）：
 *   /submit、/create、/personal-plan、/my-submissions
 * B2 往返一致性断言组**完整保留**，仍是防缺陷复发的核心；B5 明确断言旧形态 URL 已失效。
 *
 * 说明：getStateFromPath 自身不处理 scheme（`openschedule://`）——前缀剥离由
 * NavigationContainer 依据 linking.prefixes 完成。B3 按此流程模拟（剥离后再解析）。
 */
import fs from 'fs'
import path from 'path'
import { getPathFromState, getStateFromPath } from '@react-navigation/native'

import { linking } from '@/navigation/linking'

/** 移动端 src 根目录（与其它增量测试同款：tests/../src） */
const SRC = path.join(__dirname, '..', 'src')

/**
 * 真实深链配置（单一来源：@/navigation/linking —— 直接引用真实 config，非测试内副本）。
 * getStateFromPath / getPathFromState 直接消费它，确保回归保护作用在「真货」上。
 */
const config = linking.config

/** 解析结果状态类型（从真实函数签名派生，避免手写/强转） */
type ParsedState = NonNullable<ReturnType<typeof getStateFromPath>>

/** 拍平后的单条路由（仅保留断言所需字段） */
type FlatRoute = {
  name: string
  params: Record<string, unknown> | undefined
  state: ParsedState | undefined
}

/** 沿「首条分支」向下拍平导航状态，返回路由链（Tabs > Me > Profile 的逐段数组） */
function routeChain(state: ParsedState | undefined): FlatRoute[] {
  const chain: FlatRoute[] = []
  let cursor: ParsedState | undefined = state
  while (cursor && cursor.routes.length > 0) {
    const route = cursor.routes[0]
    chain.push({
      name: route.name,
      params: route.params as Record<string, unknown> | undefined,
      state: route.state,
    })
    cursor = route.state
  }
  return chain
}

/** 把状态拍平成可读的屏幕名链路，如 `'Tabs > Me > Profile'` */
function names(state: ParsedState | undefined): string {
  return routeChain(state)
    .map((route) => route.name)
    .join(' > ')
}

/** 取链路末端路由（承载 params 的叶子） */
function leaf(state: ParsedState | undefined): FlatRoute | undefined {
  const chain = routeChain(state)
  return chain.length > 0 ? chain[chain.length - 1] : undefined
}

/** 解析 URL 并断言命中（未命中即抛错，测试会明确失败而非静默通过） */
function parse(url: string): ParsedState {
  const state = getStateFromPath(url, config)
  expect(state).toBeDefined()
  if (!state) {
    throw new Error(`深链解析未命中（期望命中）：${url}`)
  }
  return state
}

/** 按 linking.prefixes 剥离 scheme，模拟 NavigationContainer 的深链入口流程 */
function toPath(url: string): string {
  const prefixes = linking.prefixes ?? []
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length)
    }
  }
  return url
}

/** 全量映射表：URL ↔ 期望屏幕名链路（可选 params） */
type DeepLinkCase = {
  url: string
  chain: string
  params?: Record<string, unknown>
}

const CASES: DeepLinkCase[] = [
  { url: '/workspace', chain: 'Tabs > Workspace > Workspace' },
  { url: '/today', chain: 'Tabs > Today > TodayFocus' },
  { url: '/projects', chain: 'Tabs > Project > ProjectList' },
  { url: '/projects/p-1', chain: 'Tabs > Project > Board', params: { projectId: 'p-1' } },
  { url: '/time', chain: 'Tabs > Time > Calendar' },
  { url: '/me', chain: 'Tabs > Me > Profile' },
  { url: '/me/notification-settings', chain: 'Tabs > Me > NotificationSettings' },
  { url: '/me/about', chain: 'Tabs > Me > About' },
  { url: '/task/task-005', chain: 'TaskDetail', params: { taskId: 'task-005' } },
  { url: '/notifications', chain: 'Notifications' },
  // 增量 1：根栈共享页（扁平字符串，与 TaskDetail / Notifications 同级）
  { url: '/submit', chain: 'Submission' },
  { url: '/create', chain: 'CreateItem' },
  { url: '/personal-plan', chain: 'PersonalPlan' },
  { url: '/my-submissions', chain: 'MySubmissions' },
  // 增量 7 补登记：审核中心（根栈共享屏，kebab-case）
  { url: '/audit-center', chain: 'AuditCenter' },
]

describe('B1. 路径解析（getStateFromPath）—— 全量映射表', () => {
  for (const testCase of CASES) {
    it(`${testCase.url} → ${testCase.chain}`, () => {
      const state = getStateFromPath(testCase.url, config)
      expect(state).toBeDefined()
      expect(names(state)).toBe(testCase.chain)
      if (testCase.params) {
        expect(leaf(state)?.params).toEqual(testCase.params)
      }
    })
  }

  it('/projects/p-1 解析出的 Board 携带 projectId 参数', () => {
    expect(leaf(parse('/projects/p-1'))?.params?.projectId).toBe('p-1')
  })

  it('/task/task-005 解析出的 TaskDetail 携带 taskId 参数', () => {
    expect(leaf(parse('/task/task-005'))?.params?.taskId).toBe('task-005')
  })
})

describe('B2. 往返一致性（getPathFromState → getStateFromPath）—— 缺陷核心判据', () => {
  for (const testCase of CASES) {
    it(`${testCase.chain} 往返后等价（源自 ${testCase.url}）`, () => {
      const original = parse(testCase.url)
      const path = getPathFromState(original, config)
      const restored = parse(path)
      expect(names(restored)).toBe(testCase.chain)
      if (testCase.params) {
        expect(leaf(restored)?.params).toEqual(testCase.params)
      }
    })
  }

  it('根屏空路径往返：/me 生成端产出 /me，且可解析回 Tabs > Me > Profile', () => {
    const state = parse('/me')
    const path = getPathFromState(state, config)
    // 生成端：根屏（初始路由）path 为空 → 只产出 tab 段，不再追加内层屏名
    expect(path).toBe('/me')
    // 解析端：确认它能被还原（缺陷复发时此处会得到 undefined / 回退到工作台）
    expect(names(parse(path))).toBe('Tabs > Me > Profile')
  })

  it('多段子屏往返：/me/notification-settings 与 /me/about 生成端产出 kebab-case 路径且可还原', () => {
    const expectations: Array<{ url: string; path: string }> = [
      { url: '/me/notification-settings', path: '/me/notification-settings' },
      { url: '/me/about', path: '/me/about' },
    ]
    for (const { url, path: expectedPath } of expectations) {
      const state = parse(url)
      const path = getPathFromState(state, config)
      // 生成端：kebab-case 小写，与 projects 风格一致
      expect(path).toBe(expectedPath)
      // 解析端：还原出等价屏幕链路
      expect(names(parse(path))).toBe(names(state))
    }
  })
})

describe('B3. scheme 前缀（openschedule:// 与 https 前缀）', () => {
  it('linking.prefixes 声明了 openschedule:// 与 https 前缀', () => {
    expect(linking.prefixes).toContain('openschedule://')
    expect(linking.prefixes).toContain('https://app.openschedule.dev')
  })

  it('openschedule://me/about 剥离前缀后解析为 Tabs > Me > About', () => {
    expect(toPath('openschedule://me/about')).toBe('me/about')
    expect(names(parse(toPath('openschedule://me/about')))).toBe('Tabs > Me > About')
  })

  it('https://app.openschedule.dev/me/notification-settings 剥离前缀后解析为 Tabs > Me > NotificationSettings', () => {
    expect(names(parse(toPath('https://app.openschedule.dev/me/notification-settings')))).toBe(
      'Tabs > Me > NotificationSettings',
    )
  })

  it('带 scheme 的完整 URL 往返：生成路径可拼回同一条深链', () => {
    const state = parse(toPath('openschedule://me/notification-settings'))
    const path = getPathFromState(state, config)
    const url = `openschedule://${path.replace(/^\//, '')}`
    expect(url).toBe('openschedule://me/notification-settings')
    expect(names(parse(toPath(url)))).toBe('Tabs > Me > NotificationSettings')
  })
})

describe('B4. 未知路径（约定行为）', () => {
  it('未注册路径解析为 undefined（约定：无隐式回退，交由应用侧回到初始态）', () => {
    // 当前约定行为：无任何 screen 匹配即返回 undefined，不存在隐式回退状态。
    // 应用侧据此回退到根初始路由（Tabs > Workspace，即工作台）。
    expect(getStateFromPath('/no-such-route-xyz', config)).toBeUndefined()
    expect(getStateFromPath('/me/NoSuchChild', config)).toBeUndefined()
  })
})

/**
 * B5 旧 URL 契约变更表：本次改造（根屏置空 + kebab-case）后，旧形态 URL 不再被注册，
 * 应全部解析失败（undefined）→ 应用侧回退初始态（Tabs > Workspace > Workspace）。
 *
 * ⚠️ 这是**有意为之的 URL 约定变更**，不是缺陷：
 *   - 旧形态把 Tab 内层屏名重复写进路径（/me/Profile、/time/Calendar …），冗余；
 *   - 新形态让 tab 根即短链（/me、/time），多段子屏统一 kebab-case（/me/notification-settings）。
 * 因此这些旧链接不再命中，属预期行为——此处显式断言，避免留成未定义行为。
 */
const LEGACY_CASES: DeepLinkCase[] = [
  { url: '/me/Profile', chain: 'Tabs > Me > Profile' },
  { url: '/me/NotificationSettings', chain: 'Tabs > Me > NotificationSettings' },
  { url: '/me/About', chain: 'Tabs > Me > About' },
  { url: '/time/Calendar', chain: 'Tabs > Time > Calendar' },
  { url: '/workspace/Workspace', chain: 'Tabs > Workspace > Workspace' },
  { url: '/today/TodayFocus', chain: 'Tabs > Today > TodayFocus' },
]

describe('B5. 旧 URL 契约变更（本次消除冗余段后的预期失效路径）', () => {
  for (const testCase of LEGACY_CASES) {
    it(`旧 URL ${testCase.url} 现已解析为 undefined（原语义：${testCase.chain}）`, () => {
      // 有意变更：旧形态（内层屏名重复出现在路径中）不再注册 → 解析失败。
      expect(getStateFromPath(testCase.url, config)).toBeUndefined()
    })
  }

  it('旧 URL 无隐式匹配 → 应用侧回退初始态（Tabs > Workspace > Workspace）', () => {
    // 与 B4 一致的约定：解析 undefined 时应用回退根初始路由，而非「猜测」到旧屏幕。
    for (const legacy of LEGACY_CASES) {
      expect(getStateFromPath(legacy.url, config)).toBeUndefined()
    }
    // 反向确认：新形态才是唯一合法入口
    expect(names(parse('/me'))).toBe('Tabs > Me > Profile')
  })
})

/**
 * B6. 根栈屏幕 ↔ 深链注册 一致性守卫（防「新增屏漏登记深链」复发）。
 *
 * 背景（P1 复发根因 · 盲区①）：增量 7 新增 `AuditCenter` 路由（stacks.tsx），但漏了
 * linking.ts 的深链注册 → `/audit-center` 静默回退 `/workspace`（Web F5 被踢回工作台）。
 * 既有 B1~B5 的 `CASES` 是**硬编码清单**，新增屏不会自动纳入，故本组断言直接**从源码**
 * 提取根共享栈（`MainRootStack`）的屏幕清单，与**真实** linking.config.screens 的键做闭环，
 * 让「新增根栈屏但漏登记深链」必然被测出。
 *
 * 豁免（两类，均非共享叶子页，本就无需深链）：
 *   - `Tabs`：Tab 容器，是根导航器内的**嵌套 navigator**，自身携带 screens 子配置；
 *   - transparentModal 抽屉（当前为 `AiProposalSheet`）：**结构性识别** `presentation:
 *     'transparentModal'`，据此豁免——将来新增同类 modal 屏不会误报（非纯硬编码）。
 */
describe('B6. 根栈屏幕 ↔ 深链注册 一致性守卫', () => {
  /** 根共享栈源码（真实单一来源） */
  const STACKS_SRC = fs.readFileSync(path.join(SRC, 'navigation', 'stacks.tsx'), 'utf8')

  /** 从源码提取 MainRootStack 注册的全部屏幕名（`\s+` 保证能吃跨行 `name=` 写法） */
  function rootScreenNames(source: string): string[] {
    const names: string[] = []
    const re = /MainRootStack\.Screen\s+name="([^"]+)"/g
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      names.push(match[1])
    }
    return names
  }

  /**
   * 结构性识别 transparentModal 抽屉屏：逐个 `<MainRootStack.Screen ... />` 声明块内，
   * 若含 `presentation: 'transparentModal'` 即视为「无需深链的弹层」，自动豁免。
   */
  function modalRootScreenNames(source: string): Set<string> {
    const modals = new Set<string>()
    const blockRe = /<MainRootStack\.Screen\b[\s\S]*?\/>/g
    let block: RegExpExecArray | null
    while ((block = blockRe.exec(source)) !== null) {
      const text = block[0]
      if (/presentation:\s*'transparentModal'/.test(text)) {
        const name = /name="([^"]+)"/.exec(text)?.[1]
        if (name) modals.add(name)
      }
    }
    return modals
  }

  /** 根栈屏清单（源码提取，按出现顺序） */
  const rootScreens = rootScreenNames(STACKS_SRC)

  /** 显式白名单豁免：Tab 容器（嵌套 navigator，自带子 screens 配置，非叶子共享页） */
  const EXPLICIT_EXEMPT: Record<string, string> = {
    Tabs: 'Tab 容器（根导航器内的嵌套 navigator），自身携带 screens 子配置，非共享叶子页',
  }

  /** 结构性豁免：transparentModal 抽屉（如 AiProposalSheet），本就无需深链 */
  const modalExempt = modalRootScreenNames(STACKS_SRC)

  /** 合并豁免集（显式白名单 ∪ 结构性 modal 识别） */
  const isExempt = (name: string): boolean =>
    name in EXPLICIT_EXEMPT || modalExempt.has(name)

  /** 真实 linking.config.screens 的键（深链注册表） */
  const registeredScreens = Object.keys(config?.screens ?? {})

  it('从源码能提取到根栈屏（护栏自检：正则/路径失效时立即失败，避免守卫变摆设）', () => {
    expect(rootScreens.length).toBeGreaterThan(0)
    // 抽查关键屏，确认提取到的确实是根共享栈而非其它栈
    expect(rootScreens).toContain('TaskDetail')
    expect(rootScreens).toContain('Notifications')
    expect(rootScreens).toContain('AuditCenter')
  })

  it('transparentModal 抽屉被结构性豁免（AiProposalSheet），且 Tabs 为显式白名单豁免', () => {
    // 结构性识别生效：AiProposalSheet 由 presentation 判定豁免（非硬编码）
    expect(modalExempt.has('AiProposalSheet')).toBe(true)
    // 显式白名单：Tabs 为 Tab 容器
    expect(isExempt('Tabs')).toBe(true)
    // 二者均应确实在根栈屏清单中
    expect(rootScreens).toContain('AiProposalSheet')
    expect(rootScreens).toContain('Tabs')
  })

  it('每个未被豁免的根栈屏都必须在 linking.config.screens 中登记深链', () => {
    // 漏登屏清单：新增根栈屏但忘记在 linking.ts 登记时，此处会非空
    const unregistered = rootScreens.filter(
      (name) => !isExempt(name) && !registeredScreens.includes(name),
    )
    // 失败信息直指漏登屏名（如 ["AuditCenter"]）→ 深链会静默回退 /workspace
    expect(unregistered).toEqual([])
  })

  it('CASES 每条 chain 的根屏名都真实存在于根栈注册表（防反向漂移）', () => {
    const rootScreenSet = new Set(rootScreens)
    const bogusRoots = CASES.map((testCase) => testCase.chain.split(' > ')[0]).filter(
      (rootName) => !rootScreenSet.has(rootName),
    )
    // 失败信息直指 CASES 中写了不存在的根屏名
    expect(bogusRoots).toEqual([])
  })
})
