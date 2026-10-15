/**
 * 职责：候选人推荐卡片 —— 得分大字 + 四项因子 Progress 条 + reason 文案；第一名高亮
 */
import { Button, Card, Progress, Tag, Typography } from 'antd'
import { CheckCircleOutlined, CrownFilled } from '@ant-design/icons'
import type { CandidateScore } from '@/types'

const { Text, Paragraph } = Typography

/** 四项因子展示配置（权重与契约 §B17 评估模型一致） */
const FACTORS: { key: keyof CandidateScore['scoreBreakdown']; label: string; color: string }[] = [
  { key: 'skill', label: '技能匹配 · 40%', color: '#4da3ff' },
  { key: 'history', label: '历史绩效 · 30%', color: '#00e5a0' },
  { key: 'load', label: '当前负载 · 20%', color: '#f5a623' },
  { key: 'complexity', label: '复杂度适配 · 10%', color: '#a855f7' },
]

const RANK_LABELS = ['首选推荐', '备选', '备选']

export default function RecommendCard({
  candidate,
  rank,
  onAssign,
}: {
  candidate: CandidateScore
  rank: number
  /** 管理版专用：点击「指派承接」直接把该候选人指派为任务承接人 */
  onAssign?: (candidate: CandidateScore) => void
}) {
  const isTop = rank === 0
  return (
    <Card
      title={
        <span>
          {isTop && <CrownFilled style={{ color: '#f5a623', marginRight: 6 }} />}
          {candidate.displayName}
          <Tag color={isTop ? 'gold' : 'default'} style={{ marginLeft: 8 }}>
            {RANK_LABELS[rank] ?? `候选 ${rank + 1}`}
          </Tag>
        </span>
      }
      style={{
        borderColor: isTop ? 'var(--accent-amber)' : 'var(--border-subtle)',
        borderWidth: isTop ? 2 : 1,
        boxShadow: isTop ? '0 2px 12px rgba(245, 166, 35, 0.15)' : undefined,
        background: 'var(--bg-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: isTop ? 'var(--accent-amber)' : 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
          {candidate.score.toFixed(2)}
        </Text>
        <Text type="secondary">综合得分（满分 1.00）</Text>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FACTORS.map(f => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ width: 104, flexShrink: 0, fontSize: 12 }}>
              {f.label}
            </Text>
            <Progress
              percent={Math.round(candidate.scoreBreakdown[f.key] * 100)}
              size="small"
              strokeColor={f.color}
              trailColor="var(--border-subtle)"
              format={() => candidate.scoreBreakdown[f.key].toFixed(2)}
              style={{ flex: 1, margin: 0 }}
            />
          </div>
        ))}
      </div>

      <Paragraph
        type="secondary"
        style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 12,
          background: 'var(--bg-card-raised)',
          border: '1px solid var(--border-subtle)',
          padding: '8px 12px',
          borderRadius: 6,
          color: 'var(--text-secondary)',
        }}
      >
        {candidate.reason}
      </Paragraph>

      {onAssign && (
        <Button
          type="primary"
          block
          size="small"
          icon={<CheckCircleOutlined />}
          style={{ marginTop: 12 }}
          onClick={() => onAssign(candidate)}
        >
          指派承接
        </Button>
      )}
    </Card>
  )
}