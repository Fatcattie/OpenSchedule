/**
 * useWikiKb.ts —— Wiki 知识库共享状态钩子
 *
 * 协作工作台（addExperience 自动建卡）与独立的「Wiki知识库」页共用同一份 localStorage 数据，
 * 通过 useLocalStorageState 的跨实例实时同步保证一致。
 */
import { useEffect } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import type { WikiEntry } from '@/types/wiki'
import { seedWikiKb } from '@/utils/wikiSeed'

export function useWikiKb() {
  const [wikiKb, setWikiKb] = useLocalStorageState<WikiEntry[]>('wiki_kb', [])
  // 冷启动：首次进入从现有 Wiki 经验卡 / 经验 / SOP 自动生成知识卡并建立 [[链接]] 互联
  useEffect(() => {
    if (wikiKb.length === 0) setWikiKb(seedWikiKb())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [wikiKb, setWikiKb] as const
}
