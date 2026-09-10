/**
 * 心情指数工具
 * - 数据类型与 localStorage key
 * - 根据 emoji + stars 生成鼓励语
 */

export type MoodEmoji = 'happy' | 'normal' | 'gloom'

export interface MoodEntry {
  date: string // YYYY-MM-DD
  emoji: MoodEmoji
  stars: number // 1-5
  ts: string
}

export const MOOD_EMOJI_META: Record<
  MoodEmoji,
  { icon: string; label: string; color: string }
> = {
  happy: { icon: '😄', label: '开心', color: '#52c41a' },
  normal: { icon: '😐', label: '一般', color: '#faad14' },
  gloom: { icon: '😞', label: '郁闷', color: '#8c8c8c' },
}

export const MOOD_STORAGE_KEY = 'os_mood_v1'

/** 当天的记录（不存在返回 undefined） */
export function findTodayMood(entries: MoodEntry[]): MoodEntry | undefined {
  const today = new Date().toISOString().slice(0, 10)
  return entries.find((e) => e.date === today)
}

/**
 * 根据心情+星级返回鼓励语。
 * 星级越高、心情越积极，鼓励越激进；
 * 心情低落时优先给出关怀与拆解建议。
 */
export function encourageFor(emoji: MoodEmoji, stars: number): string {
  const s = Math.max(1, Math.min(5, stars))
  if (emoji === 'happy') {
    if (s >= 5) return '状态拉满！今天适合攻克最难的那件事，保持节奏。'
    if (s >= 4) return '今天能量不错，优先推进重点，别忘了给自己留白。'
    if (s >= 3) return '心情在线，集中处理一件重要任务会很有成就感。'
    if (s >= 2) return '还不错，先从一个小胜利开始， momentum 会带你走更远。'
    return '有点起伏也没关系，选一件具体的小事先完成它。'
  }
  if (emoji === 'normal') {
    if (s >= 5) return '表面平静但内心稳定，这是持续输出最好的状态。'
    if (s >= 4) return '状态平稳，正好把例行但重要的事情逐一处理。'
    if (s >= 3) return '普普通通的一天，给自己定一个明确的完成标准就好。'
    if (s >= 2) return '今天有点平淡，试试把任务拆小，降低启动阻力。'
    return '状态一般时，优先保证休息，重要决定可以稍后再做。'
  }
  // gloom
  if (s >= 5) return '虽然选了郁闷，但仍给自己打了高分——这是一种很清醒的坚韧。'
  if (s >= 4) return '情绪有点低，但你还愿意记录它，这本身就是自我关照。'
  if (s >= 3) return '今天有点闷，先把最消耗情绪的事放一放，做件能掌控的小事。'
  if (s >= 2) return '郁闷的时候，允许自己慢下来，任务可以拆分、可以延后。'
  return '今天真的不容易。先照顾好自己，工作的事我们一件一件来。'
}
