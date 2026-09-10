/**
 * HealthPanel.tsx —— 项目健康度面板
 *
 * 设计：
 *  - 顶部大圆环（SVG 自绘，green/yellow/red 三色）
 *  - 四维进度条：进度 / 排期 / 负载 / 质量
 *  - 风险清单：按严重程度排序
 *  - 应急建议：点击生成 → 弹窗预览
 */
import { useState } from 'react'
import {
  Button,
  Card,
  Progress,
  Tag,
  Typography,
  List,
  Alert,
  Space,
  Modal,
  Empty,
  message,
  Statistic,
  Row,
  Col,
} from 'antd'
import {
  AlertOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  SafetyOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getProjectHealth, generateEmergency } from '@/api/healthApi'
import type { HealthRisk, EmergencySuggestion } from '@/types'
import LoadingView from './LoadingView'
import ErrorView from './ErrorView'

const { Text, Title } = Typography

interface Props {
  projectId?: string
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#cf1322',
  high: '#d46b08',
  medium: '#d4b106',
  low: '#389e0d',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
}

const DIMENSION_LABELS: Record<string, { label: string; icon: string }> = {
  progress: { label: '进度', icon: '📈' },
  schedule: { label: '排期', icon: '📅' },
  workload: { label: '负载', icon: '👥' },
  quality: { label: '质量', icon: '✅' },
}

export default function HealthPanel({ projectId }: Props) {
  const [emergencyVisible, setEmergencyVisible] = useState(false)
  const [emergencyData, setEmergencyData] = useState<EmergencySuggestion | null>(null)

  const healthQuery = useQuery({
    queryKey: ['health', projectId],
    queryFn: () => getProjectHealth(projectId!),
    enabled: !!projectId,
  })

  const emergencyMutation = useMutation({
    mutationFn: () => generateEmergency(projectId!),
    onSuccess: (data) => {
      setEmergencyData(data)
      setEmergencyVisible(true)
    },
    onError: (err: any) => message.error(err.response?.data?.message || '生成失败'),
  })

  const score = healthQuery.data?.score ?? 0
  const level = healthQuery.data?.level ?? 'green'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部：分数圆环 + 四维 */}
      <Card
        size="small"
        title={
          <Space>
            <SafetyOutlined style={{ color: level === 'green' ? '#52c41a' : level === 'yellow' ? '#faad14' : '#f5222d' }} />
            <span>项目健康度</span>
            <Tag color={level === 'green' ? 'green' : level === 'yellow' ? 'gold' : 'red'}>
              {level === 'green' ? '健康' : level === 'yellow' ? '预警' : '危险'}
            </Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            danger={level === 'red'}
            icon={<ThunderboltOutlined />}
            onClick={() => emergencyMutation.mutate()}
            loading={emergencyMutation.isPending}
            disabled={!projectId}
          >
            生成应急建议
          </Button>
        }
      >
        {healthQuery.isLoading ? (
          <LoadingView height={200} tip="正在计算健康度…" />
        ) : healthQuery.isError ? (
          <ErrorView error={healthQuery.error as Error} onRetry={() => healthQuery.refetch()} />
        ) : healthQuery.data ? (
          <Row gutter={24} align="middle">
            {/* 左：大圆环 */}
            <Col span={6} style={{ textAlign: 'center' }}>
              <HealthGauge score={score} level={level} size={140} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                {healthQuery.data.taskStats.total} 个任务
              </div>
            </Col>

            {/* 右：四维进度条 */}
            <Col span={18}>
              <Row gutter={[16, 16]}>
                {Object.entries(healthQuery.data.dimensions).map(([key, value]) => (
                  <Col span={12} key={key}>
                    <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12 }}>
                        {DIMENSION_LABELS[key]?.icon} {DIMENSION_LABELS[key]?.label}
                      </Text>
                      <Text style={{ fontSize: 12 }} type="secondary">{value}/100</Text>
                    </div>
                    <Progress
                      percent={value}
                      size="small"
                      showInfo={false}
                      strokeColor={value >= 70 ? '#52c41a' : value >= 40 ? '#faad14' : '#f5222d'}
                    />
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        ) : null}
      </Card>

      {/* 任务统计 */}
      {healthQuery.data && (
        <Card size="small" title="任务统计">
          <Row gutter={16}>
            <Col span={3}>
              <Statistic title="总任务" value={healthQuery.data.taskStats.total} />
            </Col>
            <Col span={3}>
              <Statistic title="已完成" value={healthQuery.data.taskStats.done} valueStyle={{ color: '#3f8600' }} />
            </Col>
            <Col span={3}>
              <Statistic title="进行中" value={healthQuery.data.taskStats.inProgress} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={3}>
              <Statistic title="待开始" value={healthQuery.data.taskStats.todo} />
            </Col>
            <Col span={3}>
              <Statistic title="被阻塞" value={healthQuery.data.taskStats.blocked} valueStyle={{ color: '#cf1322' }} />
            </Col>
            <Col span={3}>
              <Statistic title="已逾期" value={healthQuery.data.taskStats.overdue} valueStyle={{ color: '#cf1322' }} />
            </Col>
            <Col span={3}>
              <Statistic title="临期" value={healthQuery.data.taskStats.nearDue} valueStyle={{ color: '#faad14' }} />
            </Col>
          </Row>
        </Card>
      )}

      {/* 风险清单 */}
      <Card
        size="small"
        title={
          <Space>
            <AlertOutlined />
            <span>风险清单</span>
            <Tag>{healthQuery.data?.risks.length ?? 0}</Tag>
          </Space>
        }
      >
        {healthQuery.data?.risks.length === 0 ? (
          <Empty description="暂无风险，项目运转良好 🎉" />
        ) : (
          <List
            size="small"
            dataSource={healthQuery.data?.risks ?? []}
            renderItem={(risk: HealthRisk) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: SEVERITY_COLOR[risk.severity],
                        marginTop: 6,
                      }}
                    />
                  }
                  title={
                    <Space>
                      <span>{risk.title}</span>
                      <Tag color={SEVERITY_COLOR[risk.severity]}>
                        {SEVERITY_LABEL[risk.severity]}
                      </Tag>
                    </Space>
                  }
                  description={
                    <div>
                      <div style={{ color: '#595959', marginBottom: 4 }}>{risk.description}</div>
                      {risk.metric && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          指标：{risk.metric.name} = {risk.metric.value}{risk.metric.unit}（阈值 {risk.metric.threshold}{risk.metric.unit}）
                        </Text>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 建议 */}
      {healthQuery.data?.suggestions && healthQuery.data.suggestions.length > 0 && (
        <Card size="small" title={<span><CheckCircleOutlined style={{ color: '#52c41a' }} /> 优化建议</span>}>
          <List
            size="small"
            dataSource={healthQuery.data.suggestions}
            renderItem={(item: string) => (
              <List.Item>
                <Text>{item}</Text>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* 应急建议弹窗 */}
      <Modal
        title={
          <Space>
            <RocketOutlined style={{ color: '#f5222d' }} />
            <span>应急建议</span>
          </Space>
        }
        open={emergencyVisible}
        onCancel={() => setEmergencyVisible(false)}
        width={700}
        footer={[
          <Button key="close" onClick={() => setEmergencyVisible(false)}>关闭</Button>,
        ]}
      >
        {emergencyData && (
          <div>
            <Alert
              type={emergencyData.riskScoreBefore > 60 ? 'error' : 'warning'}
              showIcon
              message={emergencyData.summary}
              description={`当前风险分 ${emergencyData.riskScoreBefore} → 预估应用后 ${emergencyData.riskScoreAfterEstimate}`}
              style={{ marginBottom: 16 }}
            />
            <Title level={5} style={{ marginBottom: 12 }}>
              可执行措施（{emergencyData.actions.length} 项）
            </Title>
            {emergencyData.actions.length === 0 ? (
              <Empty description="未检测到需要应急处理的严重风险" />
            ) : (
              <List
                size="small"
                bordered
                dataSource={emergencyData.actions}
                renderItem={(action) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<ThunderboltOutlined style={{ color: '#faad14', fontSize: 20 }} />}
                      title={
                        <Space>
                          <span>{action.title}</span>
                          <Tag color="blue">{action.actionType}</Tag>
                          {action.riskReductionEstimate ? (
                            <Tag color="green">-{action.riskReductionEstimate} 风险分</Tag>
                          ) : null}
                        </Space>
                      }
                      description={
                        <div>
                          <div style={{ color: '#595959', marginBottom: 4 }}>
                            <strong>理由：</strong>{action.rationale}
                          </div>
                          <div style={{ color: '#389e0d' }}>
                            <strong>效果：</strong>{action.impact}
                          </div>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
            <div style={{ marginTop: 16, fontSize: 12, color: '#8c8c8c' }}>
              💡 以上为 AI 自动生成的建议草稿，点击「应用」才会真正执行（AI 提议、人确认）
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ===== SVG 健康度圆环 =====
function HealthGauge({ score, level, size = 120 }: { score: number; level: string; size?: number }) {
  const radius = size / 2 - 10
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = level === 'green' ? '#52c41a' : level === 'yellow' ? '#faad14' : '#f5222d'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* 背景环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f0f0f0"
        strokeWidth={10}
      />
      {/* 进度环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {/* 分数文字 */}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={28}
        fontWeight="bold"
        fill={color}
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 18}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fill="#8c8c8c"
      >
        / 100
      </text>
    </svg>
  )
}