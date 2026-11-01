/**
 * useWikiKb.ts —— Wiki 知识库共享状态钩子
 *
 * 协作工作台（addExperience 自动建卡）与独立的「Wiki知识库」页共用同一份 localStorage 数据，
 * 通过 useLocalStorageState 的跨实例实时同步保证一致。
 */
import { useEffect, useRef } from 'react'
import { useWorkspaceState } from './useWorkspaceState'
import type { WikiEntry } from '@/types/wiki'
import { seedWikiKb } from '@/utils/wikiSeed'

export function useWikiKb() {
  const [wikiKb, setWikiKb, { ready }] = useWorkspaceState<WikiEntry[]>('wiki_kb', [])
  // 冷启动：首次进入从现有 Wiki 经验卡 / 经验 / SOP 自动生成知识卡并建立 [[链接]] 互联。
  // 须等服务器数据加载完再判空（D-07 一期），否则加载中的空值会让种子覆盖团队已有知识卡；
  // 用函数式更新再判一次空，多个实例同时挂载也只播种一次。
  const seededRef = useRef(false)
  useEffect(() => {
    if (!ready || seededRef.current) return
    seededRef.current = true
    if (wikiKb.length === 0) setWikiKb((cur) => (cur.length === 0 ? seedWikiKb() : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
  return [wikiKb, setWikiKb] as const
}
