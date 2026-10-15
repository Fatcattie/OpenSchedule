/**
 * 职责：AI 规则读写 hook —— 内置规则 + 用户自定义规则 + 对内置规则的覆盖
 *
 * 内置规则随代码版本演进，因此不整体落 localStorage：
 * - 用户新建的规则单独存 ai_rules
 * - 对内置规则的修改存 ai_rule_overrides（按 id 覆盖）
 * 这样后续新增内置规则能自动生效，且不会覆盖用户的自定义内容。
 */
import { useMemo } from 'react'
import { useLocalStorageState } from './useLocalStorageState'
import { BUILTIN_RULES } from '@/utils/aiRules'
import type { AiRule } from '@/types'

export function useAiRules() {
  const [customRules, setCustomRules] = useLocalStorageState<AiRule[]>('ai_rules', () => [])
  const [overrides, setOverrides] = useLocalStorageState<AiRule[]>('ai_rule_overrides', () => [])

  const rules = useMemo(() => {
    const builtin = BUILTIN_RULES.map((r) => {
      const ov = overrides.find((o) => o.id === r.id)
      return ov ? { ...r, ...ov, builtin: true } : r
    })
    return [...builtin, ...customRules]
  }, [customRules, overrides])

  /** 新增或更新一条规则（内置规则写入覆盖表） */
  const saveRule = (rule: AiRule) => {
    const isBuiltin = BUILTIN_RULES.some((r) => r.id === rule.id)
    const target = isBuiltin ? setOverrides : setCustomRules
    target((c) => {
      const i = c.findIndex((o) => o.id === rule.id)
      if (i >= 0) {
        const next = [...c]
        next[i] = rule
        return next
      }
      return [...c, rule]
    })
  }

  /** 删除自定义规则；对内置规则效果等同「恢复默认」 */
  const removeRule = (id: string) => {
    setCustomRules((c) => c.filter((r) => r.id !== id))
    setOverrides((c) => c.filter((r) => r.id !== id))
  }

  /** 恢复全部默认：清空自定义规则与覆盖 */
  const resetAll = () => {
    setCustomRules([])
    setOverrides([])
  }

  return { rules, saveRule, removeRule, resetAll }
}

/** 生成新规则的默认对象 */
export function createEmptyRule(scene: AiRule['scene']): AiRule {
  const now = new Date().toISOString()
  return {
    id: `rule-custom-${Date.now()}`,
    name: '',
    scene,
    industry: '通用',
    taskType: '通用',
    enabled: true,
    priority: 50,
    promptTemplate: '',
    steps: [],
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
}
