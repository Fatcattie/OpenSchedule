/**
 * decompose-engine.spec.ts —— AI 拆解引擎单测
 */
import { describe, expect, it } from 'vitest'
import {
  decompose,
  scheduleDecompose,
  type DecomposeInput,
} from './decompose-engine'

describe('decompose-engine', () => {
  // ============ 模板模式 ============

  describe('模板模式', () => {
    const tplTasks = [
      { title: '设计 {{goal}} 架构', description: '输出架构图', estimatedHours: 8, isShared: true },
      { title: '开发 {{goal}}', description: '编码实现', estimatedHours: 16 },
      { title: '测试 {{goal}}', description: '编写测试用例并执行', estimatedHours: 8, priority: 'high' },
    ]

    it('克隆模板任务（数量/字段透传）', () => {
      const input: DecomposeInput = { goalTitle: '登录模块', templateTasks: tplTasks }
      const result = decompose(input)
      expect(result.tasks.length).toBe(3)
      expect(result.tasks[0].estimatedHours).toBe(8)
      expect(result.tasks[0].isShared).toBe(true)
      expect(result.tasks[0].priority).toBe('medium')
      expect(result.tasks[2].priority).toBe('high')
    })

    it('{{goal}} 占位替换', () => {
      const input: DecomposeInput = { goalTitle: '登录模块', templateTasks: tplTasks }
      const result = decompose(input)
      expect(result.tasks[0].title).toBe('设计 登录模块 架构')
      expect(result.tasks[1].title).toBe('开发 登录模块')
    })

    it('模板依赖索引映射', () => {
      const input: DecomposeInput = {
        goalTitle: '登录模块',
        templateTasks: tplTasks,
        templateDependencies: [
          { fromIndex: 0, toIndex: 1, type: 'FS' },
          { fromIndex: 1, toIndex: 2, type: 'FS', lagDays: 1 },
        ],
      }
      const result = decompose(input)
      expect(result.dependencies.length).toBe(2)
      expect(result.dependencies[0].fromIndex).toBe(0)
      expect(result.dependencies[0].toIndex).toBe(1)
      expect(result.dependencies[0].type).toBe('FS')
      expect(result.dependencies[1].lagDays).toBe(1)
    })

    it('模板估时全为 0 + 用户给 total → 均分', () => {
      const input: DecomposeInput = {
        goalTitle: '登录模块',
        templateTasks: [
          { title: '任务A', estimatedHours: 0 },
          { title: '任务B', estimatedHours: 0 },
          { title: '任务C', estimatedHours: 0 },
        ],
        totalEstimatedHours: 30,
      }
      const result = decompose(input)
      // 30/3 = 10 均分
      expect(result.tasks[0].estimatedHours).toBe(10)
      expect(result.tasks[2].estimatedHours).toBe(10)
    })

    it('模板有估时 → 沿用模板，不覆盖', () => {
      const input: DecomposeInput = {
        goalTitle: '登录模块',
        templateTasks: [
          { title: '任务A', estimatedHours: 8 },
          { title: '任务B', estimatedHours: 16 },
        ],
        totalEstimatedHours: 100,
      }
      const result = decompose(input)
      expect(result.tasks[0].estimatedHours).toBe(8)
      expect(result.tasks[1].estimatedHours).toBe(16)
    })

    it('模板为空 → warning', () => {
      const input: DecomposeInput = { goalTitle: '登录模块', templateTasks: [] }
      const result = decompose(input)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  // ============ 启发式模式 ============

  describe('启发式模式', () => {
    it('单行目标 → 单任务', () => {
      const result = decompose({ goalTitle: '开发首页' })
      expect(result.tasks.length).toBe(1)
      expect(result.tasks[0].title).toBe('开发首页')
      expect(result.dependencies.length).toBe(0)
    })

    it('分号切分 → 多任务 + FS 串联依赖', () => {
      const result = decompose({ goalTitle: '设计数据库；开发 API；测试联调' })
      expect(result.tasks.length).toBe(3)
      expect(result.tasks[0].title).toBe('设计数据库')
      expect(result.tasks[1].title).toBe('开发 API')
      expect(result.tasks[2].title).toBe('测试联调')
      expect(result.dependencies.length).toBe(2)
      expect(result.dependencies[0]).toEqual({ fromIndex: 0, toIndex: 1, type: 'FS', lagDays: 0 })
      expect(result.dependencies[1]).toEqual({ fromIndex: 1, toIndex: 2, type: 'FS', lagDays: 0 })
    })

    it('逗号/换行切分', () => {
      const result = decompose({ goalTitle: '需求分析、原型设计\n视觉走查' })
      expect(result.tasks.length).toBe(3)
      expect(result.tasks[0].title).toBe('需求分析')
      expect(result.tasks[1].title).toBe('原型设计')
      expect(result.tasks[2].title).toBe('视觉走查')
    })

    it('关键词估时（设计 8h / 开发 16h / 测试 8h / 文档 4h）', () => {
      const result = decompose({ goalTitle: '写架构设计；开发核心功能；执行测试；输出使用文档' })
      const hours = result.tasks.map(t => t.estimatedHours)
      expect(hours[0]).toBe(8)   // 设计
      expect(hours[1]).toBe(16)  // 开发
      expect(hours[2]).toBe(8)   // 测试
      expect(hours[3]).toBe(4)   // 文档
    })

    it('无关键词 → 默认 8h', () => {
      const result = decompose({ goalTitle: '准备会议材料' })
      expect(result.tasks[0].estimatedHours).toBe(8)
    })

    it('isShared 关键词检测（公共/共享/基础）', () => {
      const result = decompose({ goalTitle: '搭公共脚手架；写业务页面' })
      expect(result.tasks[0].isShared).toBe(true)
      expect(result.tasks[1].isShared).toBe(false)
    })

    it('高优先级关键词（紧急/修复）', () => {
      const result = decompose({ goalTitle: '紧急修复线上故障；回归验证' })
      expect(result.tasks[0].priority).toBe('high')
      expect(result.tasks[1].priority).toBe('medium')
    })

    it('totalEstimatedHours 均分', () => {
      const result = decompose({ goalTitle: 'A；B；C；D', totalEstimatedHours: 40 })
      expect(result.tasks[0].estimatedHours).toBe(10)
      expect(result.tasks[3].estimatedHours).toBe(10)
    })

    it('目标标题只有空白 → 空片段兜底单任务 + warning', () => {
      const result = decompose({ goalTitle: '   ' })
      // goalTitle.trim() 为空 → 单任务兜底      expect(result.tasks.length).toBe(1)
      // 空标题任务      expect(result.tasks[0].title).toBe('')
    })
  })

  // ============ CPM 排期 ============

  describe('scheduleDecompose（CPM 集成）', () => {
    it('串联依赖 → 有 ES/EF 且后置任务不早于前置', () => {
      const result = decompose({ goalTitle: '设计；开发；测试' })
      const scheduled = scheduleDecompose(result, { startDate: '2026-08-24' })  // 周一
      expect(scheduled.tasks.length).toBe(3)
      expect(scheduled.tasks[0].earliestStart).toBeDefined()
      expect(scheduled.tasks[0].earliestFinish).toBeDefined()
      // 后置任务的 ES 应 >= 前置任务的 EF + 1 工作日
      const es1 = new Date(scheduled.tasks[1].earliestStart!)
      const ef0 = new Date(scheduled.tasks[0].earliestFinish!)
      expect(es1.getTime()).toBeGreaterThanOrEqual(ef0.getTime())
    })

    it('projectEta + criticalPath 返回', () => {
      const result = decompose({ goalTitle: 'A；B；C' })
      const scheduled = scheduleDecompose(result, { startDate: '2026-08-24' })
      expect(scheduled.projectEta).toBeDefined()
      expect(scheduled.criticalPath.length).toBeGreaterThan(0)
    })

    it('周末顺延（周五起的 16h 任务结束于下周一）', () => {
      const result = decompose({ goalTitle: '开发一个耗时长的任务' })  // 16h = 2 天 (durDays=2)
      const scheduled = scheduleDecompose(result, { startDate: '2026-08-28' })  // 周五
      const ef = new Date(scheduled.tasks[0].earliestFinish!)
      // CPM: EF = addWorkdays(ES, dur-1) = addWorkdays(周五, 1) = 跳过周末 = 下周一
      expect(ef.getUTCDay()).toBe(1)  // 周一
    })
  })

  // ============ 边界 ============

  describe('边界情况', () => {
    it('超过 12 段 → warning', () => {
      const parts = Array.from({ length: 15 }, (_, i) => `步骤${i + 1}`).join('；')
      const result = decompose({ goalTitle: parts })
      expect(result.tasks.length).toBe(15)
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('模板依赖类型非法 → 归 FS', () => {
      const result = decompose({
        goalTitle: 'x',
        templateTasks: [{ title: 'A' }, { title: 'B' }],
        templateDependencies: [{ fromIndex: 0, toIndex: 1, type: 'ZZ' as any }],
      })
      expect(result.dependencies[0].type).toBe('FS')
    })
  })
})
