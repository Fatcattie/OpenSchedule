/**
 * 职责：时间轴（日 / 周视图）同列重叠任务的「泳道」分配纯函数（BugFix #17）。
 * 背景：同一列内时间区间重叠的任务必须并排显示（泳道），而不是相互叠压。
 * 设计：按开始时间排序后贪心占用「最早可用的泳道」；以「连通重叠簇」为单位统计泳道总数，
 *       每个任务宽度 = 列宽 / 所在簇的泳道数。纯函数、无副作用，便于单测。
 */

/** 泳道分配输入（时间用同一口径的分钟数即可，只要求可比较大小） */
export interface LaneInput {
  id: string
  /** 起始（分钟） */
  start: number
  /** 结束（分钟）；<= start 时按 start + 1 处理，避免零 / 负长度 */
  end: number
}

/** 泳道分配结果 */
export interface LaneAssignment {
  id: string
  /** 泳道序号（0 起，0 最靠左） */
  laneIndex: number
  /** 该任务所在重叠簇的泳道总数（>= 1） */
  laneCount: number
}

/** 归一化后的内部结构（保留原始下标，用于还原输入顺序） */
interface NormalizedLaneInput extends LaneInput {
  index: number
}

/**
 * 把同一列的任务按时间重叠关系分配到泳道。
 *
 * 算法：按 start 升序排序（相同 start 时 end 小者优先，再按原始顺序稳定排序）；
 * 顺序扫描并用「连通重叠簇」切分：若下一个任务的 start >= 当前簇的最大 end，
 * 则开启新簇。簇内用 laneEnds 数组做贪心分配——优先复用最早结束且已空闲的泳道，
 * 否则新开一条泳道；该簇的泳道总数即 laneEnds.length。
 *
 * @param items 同列任务（顺序任意）
 * @returns 与入参等长、顺序一致的分配结果
 */
export function assignLanes(items: LaneInput[]): LaneAssignment[] {
  const normalized: NormalizedLaneInput[] = items.map((item, index) => ({
    id: item.id,
    start: item.start,
    end: Math.max(item.end, item.start + 1),
    index,
  }))

  const sorted = normalized.slice().sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    if (a.end !== b.end) return a.end - b.end
    return a.index - b.index
  })

  const assignments = new Map<number, LaneAssignment>()
  let cluster: NormalizedLaneInput[] = []
  let clusterEnd = Number.NEGATIVE_INFINITY

  const flushCluster = (): void => {
    if (cluster.length === 0) return
    const laneEnds: number[] = []
    const placed: { entry: NormalizedLaneInput; laneIndex: number }[] = []
    cluster.forEach((entry) => {
      // 找一条已空闲（结束时间 <= 当前开始时间）的泳道复用
      let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= entry.start)
      if (laneIndex === -1) {
        laneIndex = laneEnds.length
        laneEnds.push(entry.end)
      } else {
        laneEnds[laneIndex] = entry.end
      }
      placed.push({ entry, laneIndex })
    })
    const laneCount = laneEnds.length
    placed.forEach(({ entry, laneIndex }) => {
      assignments.set(entry.index, { id: entry.id, laneIndex, laneCount })
    })
    cluster = []
    clusterEnd = Number.NEGATIVE_INFINITY
  }

  sorted.forEach((entry) => {
    if (cluster.length > 0 && entry.start >= clusterEnd) {
      flushCluster()
    }
    cluster.push(entry)
    if (entry.end > clusterEnd) clusterEnd = entry.end
  })
  flushCluster()

  return normalized.map(
    (entry) => assignments.get(entry.index) ?? { id: entry.id, laneIndex: 0, laneCount: 1 },
  )
}
