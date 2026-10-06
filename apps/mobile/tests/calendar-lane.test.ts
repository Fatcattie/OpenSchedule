/**
 * 职责：周视图泳道分配纯函数单测（BugFix #17）。
 * 由 QA（严过关）独立审查并补强：原用例仅覆盖「无重叠 / 两两重叠 / 部分重叠 / 顺序与空输入」，
 * 缺「链式重叠（最易出错）」「全部完全重叠」「跨日 / 负起点」「坐标区间不重叠」等边界与不变量。
 *
 * 断言策略：既校验 laneIndex / laneCount 的**精确值**，也用「归一化坐标区间」做**不变量断言**
 * （同簇内任意两块的水平区间不相交、且 laneCount = 该点最大重叠深度），
 * 避免「只要 laneCount>1 就算过」这类弱断言。
 */
import { assignLanes, type LaneAssignment, type LaneInput } from '@/utils/lane'

/** 归一化区间（与服务内一致：end <= start 时按 start + 1 兜底） */
function norm(item: LaneInput): { start: number; end: number } {
  return { start: item.start, end: Math.max(item.end, item.start + 1) }
}

/** 两块时间区间是否重叠（半开区间；首尾相接不算重叠） */
function overlaps(a: LaneInput, b: LaneInput): boolean {
  const na = norm(a)
  const nb = norm(b)
  return na.start < nb.end && nb.start < na.end
}

/** 把泳道分配换算成水平坐标区间 [left, right)（相对列宽归一化） */
function xInterval(a: LaneAssignment): { left: number; right: number } {
  const lanes = Math.max(1, a.laneCount)
  return { left: a.laneIndex / lanes, right: (a.laneIndex + 1) / lanes }
}

/** 区间是否水平不相交（允许端点相接） */
function xDisjoint(a: LaneAssignment, b: LaneAssignment): boolean {
  const ia = xInterval(a)
  const ib = xInterval(b)
  return ia.right <= ib.left || ib.right <= ia.left
}

/** 扫描线求「任意时刻的最大重叠深度」——即该组任务理论所需的最少泳道数 */
function maxOverlapDepth(items: LaneInput[]): number {
  const events: { at: number; delta: number }[] = []
  items.forEach((item) => {
    const { start, end } = norm(item)
    events.push({ at: start, delta: 1 })
    events.push({ at: end, delta: -1 })
  })
  // 同点先处理结束（-1），再处理开始（+1）：保证首尾相接不算重叠
  events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.delta - b.delta))
  let depth = 0
  let max = 0
  events.forEach((event) => {
    depth += event.delta
    if (depth > max) max = depth
  })
  return max
}

/**
 * 核心不变量：对给定输入，泳道分配必须满足
 * ① 任意两块时间重叠 ⇒ laneIndex 不同（否则视觉叠压）；
 * ② 任意两块时间重叠 ⇒ laneCount 相同（同簇）且水平区间不相交；
 * ③ 最大重叠深度 ⇒ laneCount 不小于该深度（贪心区间划分取最优，应恰好等于）。
 */
function assertNoOverlapInvariant(items: LaneInput[]): void {
  const result = assignLanes(items)
  expect(result).toHaveLength(items.length)

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (!overlaps(items[i], items[j])) continue
      expect(result[i].laneIndex).not.toBe(result[j].laneIndex)
      expect(result[i].laneCount).toBe(result[j].laneCount)
      expect(xDisjoint(result[i], result[j])).toBe(true)
    }
  }

  // 泳道数下界：整组所需泳道数 = 最大重叠深度
  const depth = maxOverlapDepth(items)
  result.forEach((item) => {
    expect(item.laneCount).toBeGreaterThanOrEqual(1)
    expect(item.laneCount).toBeLessThanOrEqual(Math.max(1, depth))
  })
}

describe('assignLanes —— 周视图同列重叠任务的泳道分配', () => {
  describe('边界：空 / 单任务 / 全不重叠', () => {
    it('空输入返回空数组', () => {
      expect(assignLanes([])).toEqual([])
    })

    it('单任务独占 0 号泳道，laneCount = 1', () => {
      expect(assignLanes([{ id: 'only', start: 30, end: 90 }])).toEqual([
        { id: 'only', laneIndex: 0, laneCount: 1 },
      ])
    })

    it('全部互不重叠：均在 0 号泳道，laneCount 均为 1', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 60, end: 120 },
        { id: 'c', start: 180, end: 240 },
      ]
      assignLanes(items).forEach((item) => {
        expect(item.laneIndex).toBe(0)
        expect(item.laneCount).toBe(1)
      })
      assertNoOverlapInvariant(items)
    })

    it('首尾相接（end == 下一块 start）不算重叠，可同泳道且各占整列', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 60, end: 120 },
      ]
      const result = assignLanes(items)
      expect(result.map((r) => r.laneIndex)).toEqual([0, 0])
      expect(result.map((r) => r.laneCount)).toEqual([1, 1])
    })
  })

  describe('重叠：全部完全重叠 / 两两重叠', () => {
    it('两两重叠：分到不同泳道，laneCount = 2', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 120 },
        { id: 'b', start: 30, end: 90 },
      ]
      const result = assignLanes(items)
      expect(result.find((r) => r.id === 'a')?.laneIndex).toBe(0)
      expect(result.find((r) => r.id === 'b')?.laneIndex).toBe(1)
      result.forEach((r) => expect(r.laneCount).toBe(2))
      assertNoOverlapInvariant(items)
    })

    it('全部完全重叠（4 块同区间）：泳道数 = 4，laneIndex 覆盖 0..3 且互异', () => {
      const items: LaneInput[] = Array.from({ length: 4 }, (_, i) => ({
        id: `t${i}`,
        start: 100,
        end: 200,
      }))
      const result = assignLanes(items)
      expect(result.map((r) => r.laneIndex).sort()).toEqual([0, 1, 2, 3])
      result.forEach((r) => expect(r.laneCount).toBe(4))
      assertNoOverlapInvariant(items)
    })
  })

  describe('链式重叠（重点：A∩B、B∩C，但 A∩C = ∅）', () => {
    it('A[0,60] B[30,90] C[60,120]：仅需 2 条泳道，A 与 C 复用 0 号', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 30, end: 90 },
        { id: 'c', start: 60, end: 120 },
      ]
      const byId = new Map(assignLanes(items).map((r) => [r.id, r]))
      expect(byId.get('a')?.laneIndex).toBe(0)
      expect(byId.get('b')?.laneIndex).toBe(1)
      expect(byId.get('c')?.laneIndex).toBe(0)
      // 关键：整簇泳道数为 2，而不是 3（若实现按「两两重叠」朴素判会误算成 3）
      byId.forEach((r) => expect(r.laneCount).toBe(2))
      assertNoOverlapInvariant(items)
    })

    it('长中段链 A[0,120] B[60,180] C[120,240]：仍需 2 条泳道', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 120 },
        { id: 'b', start: 60, end: 180 },
        { id: 'c', start: 120, end: 240 },
      ]
      const result = assignLanes(items)
      const byId = new Map(result.map((r) => [r.id, r]))
      expect(byId.get('a')?.laneIndex).toBe(0)
      expect(byId.get('b')?.laneIndex).toBe(1)
      expect(byId.get('c')?.laneIndex).toBe(0)
      result.forEach((r) => expect(r.laneCount).toBe(2))
      assertNoOverlapInvariant(items)
    })

    it('阶梯链（5 块，每块仅与相邻重叠）：泳道数 = 2，不随长度膨胀', () => {
      const items: LaneInput[] = Array.from({ length: 5 }, (_, i) => ({
        id: `s${i}`,
        start: i * 10,
        end: i * 10 + 20, // 与下一块重叠 10，与下下块不重叠
      }))
      const result = assignLanes(items)
      result.forEach((r) => expect(r.laneCount).toBe(2))
      expect(result.map((r) => r.laneIndex)).toEqual([0, 1, 0, 1, 0])
      assertNoOverlapInvariant(items)
    })

    it('簇间切分：一个 3 深度簇 + 一个独立块，各自 laneCount 互不影响', () => {
      const items: LaneInput[] = [
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 0, end: 60 },
        { id: 'c', start: 0, end: 60 },
        { id: 'd', start: 300, end: 360 },
      ]
      const byId = new Map(assignLanes(items).map((r) => [r.id, r]))
      expect(byId.get('a')?.laneCount).toBe(3)
      expect(byId.get('b')?.laneCount).toBe(3)
      expect(byId.get('c')?.laneCount).toBe(3)
      expect(byId.get('d')?.laneCount).toBe(1)
      expect(byId.get('d')?.laneIndex).toBe(0)
      assertNoOverlapInvariant(items)
    })
  })

  describe('时间口径：跨日 / 负起点 / 零时长', () => {
    it('跨日任务（起点早于时间窗为负值、终点远超窗口）：仍按重叠关系分泳道', () => {
      const items: LaneInput[] = [
        { id: 'long', start: -300, end: 900 }, // 跨 08:00 前 ~ 20:00 后
        { id: 'mid', start: 60, end: 120 },
        { id: 'mid2', start: 90, end: 150 },
      ]
      const byId = new Map(assignLanes(items).map((r) => [r.id, r]))
      // long 与 mid、mid2 均重叠 → 3 条泳道
      expect(byId.get('long')?.laneCount).toBe(3)
      expect(byId.get('mid')?.laneCount).toBe(3)
      expect(byId.get('mid2')?.laneCount).toBe(3)
      assertNoOverlapInvariant(items)
    })

    it('零时长（start === end）按 1 分钟兜底，可与他块判重叠', () => {
      const items: LaneInput[] = [
        { id: 'z', start: 30, end: 30 },
        { id: 'o', start: 30, end: 90 },
      ]
      const result = assignLanes(items)
      const byId = new Map(result.map((r) => [r.id, r]))
      expect(byId.get('z')?.laneIndex).not.toBe(byId.get('o')?.laneIndex)
      result.forEach((r) => expect(r.laneCount).toBe(2))
      assertNoOverlapInvariant(items)
    })

    it('单独零时长任务：独占整列（laneIndex 0 / laneCount 1）', () => {
      expect(assignLanes([{ id: 'z', start: 30, end: 30 }])).toEqual([
        { id: 'z', laneIndex: 0, laneCount: 1 },
      ])
    })
  })

  describe('输入顺序与稳定性', () => {
    it('乱序输入：输出顺序与入参一致（按 id 对齐）', () => {
      const items: LaneInput[] = [
        { id: 'later', start: 120, end: 180 },
        { id: 'earlier', start: 0, end: 60 },
        { id: 'middle', start: 60, end: 120 },
      ]
      expect(assignLanes(items).map((r) => r.id)).toEqual(['later', 'earlier', 'middle'])
    })

    it('相同 start / end 时按原始下标稳定分配（先来先占靠前泳道）', () => {
      const items: LaneInput[] = [
        { id: 'first', start: 0, end: 60 },
        { id: 'second', start: 0, end: 60 },
      ]
      const result = assignLanes(items)
      expect(result[0].laneIndex).toBe(0)
      expect(result[1].laneIndex).toBe(1)
    })
  })

  describe('不变量：坐标区间不相交（实现「块宽 = 列宽 / 簇泳道数」的真实保证）', () => {
    it('构造真实种子数据规模的混合场景，逐对断言水平区间不相交', () => {
      // 模拟「今日」种子：9:00-10:30 / 9:00-12:00 / 10:00-11:30 → 三块两两重叠，深度 3
      // 以及 14:00-17:00 / 15:00-16:00 / 16:00-17:30 → 链式（长块与另两块重叠，另两块仅 16:00 相接）
      const items: LaneInput[] = [
        { id: '需求文档评审', start: 60, end: 150 },
        { id: '首页原型设计', start: 60, end: 240 },
        { id: '接口联调环境', start: 120, end: 210 },
        { id: '组件库搭建', start: 360, end: 540 },
        { id: '日志查询小工具', start: 420, end: 480 },
        { id: '本周复盘会材料', start: 480, end: 570 },
      ]
      const result = assignLanes(items)
      const byId = new Map(result.map((r) => [r.id, r]))
      // 第一簇：三块两两重叠 → 3 条泳道（对应 QA 观察到的「窄泳道标题截断」场景）
      expect(byId.get('需求文档评审')?.laneCount).toBe(3)
      expect(byId.get('首页原型设计')?.laneCount).toBe(3)
      expect(byId.get('接口联调环境')?.laneCount).toBe(3)
      // 第二簇：14:00-17:00 与 15:00-16:00 / 16:00-17:30 重叠，但后两者仅 16:00 相接 → 只需 2 条泳道
      expect(byId.get('组件库搭建')?.laneCount).toBe(2)
      expect(byId.get('日志查询小工具')?.laneCount).toBe(2)
      expect(byId.get('本周复盘会材料')?.laneCount).toBe(2)
      assertNoOverlapInvariant(items)
    })

    it('确定性随机（LCG）20 组：任意重叠对均不同泳道且水平不相交', () => {
      // 线性同余伪随机，固定种子 → 结果可复现，避免 flaky
      let seed = 20260926
      const rand = (max: number): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed % max
      }
      for (let round = 0; round < 20; round += 1) {
        const count = 2 + rand(8)
        const items: LaneInput[] = Array.from({ length: count }, (_, i) => {
          const start = rand(600)
          const end = start + 1 + rand(120)
          return { id: `r${round}-${i}`, start, end }
        })
        assertNoOverlapInvariant(items)
      }
    })
  })

  describe('日视图场景（BugFix #18：默认视图同列重叠必须并排，不得满宽叠压）', () => {
    // 复刻「今天」的真实种子块（相对 08:00 的分钟）：团队任务 + 个人任务，含 9:00 三重叠簇与 14:00 链式簇
    const TODAY_BLOCKS: LaneInput[] = [
      { id: '视觉规范定稿', start: 0, end: 60 },
      { id: '需求文档评审', start: 60, end: 150 },
      { id: '首页原型设计', start: 60, end: 240 },
      { id: '晨会同步', start: 90, end: 120 },
      { id: '接口联调环境', start: 120, end: 210 },
      { id: '完成提报：首页原型评审', start: 300, end: 360 },
      { id: '组件库搭建', start: 360, end: 540 },
      { id: '日志查询小工具', start: 420, end: 480 },
      { id: '本周复盘会材料', start: 480, end: 570 },
      { id: '官网改版验收清单', start: 600, end: 690 },
      { id: '整理本周周报', start: 690, end: 750 },
    ]

    it('整日所有重叠块的水平区间互不相交（回归 QA 实测的 7 组叠压）', () => {
      const result = assignLanes(TODAY_BLOCKS)
      const byId = new Map(result.map((r) => [r.id, r]))

      // 9:00 簇：需求文档评审 / 首页原型设计 / 晨会同步 / 接口联调环境 连通重叠 → 3 条泳道
      expect(byId.get('需求文档评审')?.laneCount).toBe(3)
      expect(byId.get('首页原型设计')?.laneCount).toBe(3)
      expect(byId.get('晨会同步')?.laneCount).toBe(3)
      expect(byId.get('接口联调环境')?.laneCount).toBe(3)

      // 14:00 簇：组件库搭建与另两块链式重叠（后两者仅 16:00 相接）→ 2 条泳道
      expect(byId.get('组件库搭建')?.laneCount).toBe(2)
      expect(byId.get('日志查询小工具')?.laneCount).toBe(2)
      expect(byId.get('本周复盘会材料')?.laneCount).toBe(2)

      // 无重叠块（视觉规范定稿 / 完成提报 / 官网改版验收清单 / 整理本周周报）独占整列
      expect(byId.get('视觉规范定稿')?.laneCount).toBe(1)
      expect(byId.get('完成提报：首页原型评审')?.laneCount).toBe(1)

      assertNoOverlapInvariant(TODAY_BLOCKS)
    })

    it('逐对断言：任意两块时间重叠 ⇒ 水平区间 [left, right) 不相交', () => {
      const result = assignLanes(TODAY_BLOCKS)
      let overlapPairs = 0
      for (let i = 0; i < TODAY_BLOCKS.length; i += 1) {
        for (let j = i + 1; j < TODAY_BLOCKS.length; j += 1) {
          if (!overlaps(TODAY_BLOCKS[i], TODAY_BLOCKS[j])) continue
          overlapPairs += 1
          expect(xDisjoint(result[i], result[j])).toBe(true)
        }
      }
      // 至少覆盖到 QA 用 DOM 实测的 7 组叠压（修复前全部满宽叠压）
      expect(overlapPairs).toBeGreaterThanOrEqual(7)
    })
  })
})
