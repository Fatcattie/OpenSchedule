/**
 * 职责：导入导出页 —— CSV 批量导入任务（AntD Dragger + .csv 校验 + 导入结果/失败明细表格）+ 任务 CSV 导出（blob 下载）
 */
import { useState } from 'react'
import { Alert, Button, Card, Col, Row, Select, Space, Statistic, Table, Tabs, Typography, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import StatsPanel from '@/components/stats/StatsPanel'
import { getErrorMessage } from '@/api/errors'
import { downloadBlob, exportTasksCsv, importTasksCsv, type ImportErrorRow, type ImportResult } from '@/api/importExportApi'
import { projectApi } from '@/api/projectApi'
import type { Project } from '@/types'

const { Dragger } = Upload
const { Title, Text } = Typography

/** 导入失败明细列定义（line 为 CSV 物理行号：表头=第 1 行，首数据行=第 2 行） */
const ERROR_COLUMNS = [
  { title: '物理行号', dataIndex: 'line', width: 100 },
  { title: '失败原因', dataIndex: 'reason' },
]

/** 页面外壳：导入导出 / 数据统计 两个板块 */
export default function ImportExportPage() {
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        数据中枢
      </Title>
      <Tabs
        defaultActiveKey="io"
        items={[
          { key: 'io', label: '导入导出', children: <ImportExportPanel /> },
          { key: 'stats', label: '数据统计', children: <StatsPanel /> },
        ]}
      />
    </div>
  )
}

function ImportExportPanel() {
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importProjectId, setImportProjectId] = useState<string | undefined>()
  const [exportProjectId, setExportProjectId] = useState<string | undefined>()
  const [importing, setImporting] = useState(false)

  // 项目下拉（导入归属项目 / 导出范围）；pageSize 100 够 Phase 1 演示，分页下拉为后续批次
  const projectsQuery = useQuery({
    queryKey: ['projects', 'options'],
    queryFn: () => projectApi.listProjects({ pageSize: 100 }),
  })
  const projectOptions = (projectsQuery.data?.items ?? []).map((p: Project) => ({ value: p.id, label: p.name }))

  const exportMutation = useMutation({
    mutationFn: () => exportTasksCsv(exportProjectId),
    onSuccess: (blob) => {
      // 文件名带时间戳，避免重复导出覆盖本地文件
      downloadBlob(blob, `openschedule-tasks-${dayjs().format('YYYYMMDD-HHmm')}.csv`)
      message.success('导出成功，已开始下载')
    },
    onError: (e) => message.error(getErrorMessage(e)),
  })

  /** 拖拽/选择文件即触发导入（beforeUpload 拦截非法类型，customRequest 接管上传逻辑；projectId 必选） */
  const handleImportRequest: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File
    if (!importProjectId) {
      message.error('请先选择导入目标项目')
      options.onError?.(new Error('请先选择导入目标项目'))
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const result = await importTasksCsv(file, importProjectId)
      setImportResult(result)
      options.onSuccess?.(result)
      message.success(`导入完成：成功 ${result.imported} 条，失败 ${result.failed} 条`)
    } catch (e) {
      options.onError?.(e as Error)
      message.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      {/* ── 导入卡片 ── */}
      <Card title="CSV 导入任务" style={{ marginBottom: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="CSV 格式说明"
          description={
            <div>
              <Text>表头固定为：title,description,priority,due_at,estimated_hours,tags,assignee_email</Text>
              <br />
              <Text type="secondary">
                title 必填（≤200 字符）；priority 取值 urgent/high/medium/low（非法值回落 medium）；due_at
                为 ISO8601；tags 用分号分隔；assignee_email 须为本租户成员；失败行不影响成功行落库
              </Text>
            </div>
          }
        />
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Select
            style={{ width: 320 }}
            loading={projectsQuery.isLoading}
            placeholder="导入到哪个项目（必选：任务归属项目）"
            options={projectOptions}
            value={importProjectId}
            onChange={(v) => setImportProjectId(v)}
          />
          <Dragger
            accept=".csv,text/csv"
            maxCount={1}
            disabled={importing}
            showUploadList={{ showRemoveIcon: true }}
            beforeUpload={(file) => {
              const ok = file.name.toLowerCase().endsWith('.csv')
              if (!ok) message.error('仅支持 .csv 文件')
              return ok ? true : Upload.LIST_IGNORE
            }}
            customRequest={handleImportRequest}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{importing ? '正在导入…' : '点击或拖拽 CSV 文件到此处'}</p>
            <p className="ant-upload-hint">单文件，建议 ≤10MB；导入成功后失败明细见下方</p>
          </Dragger>
        </Space>

        {/* 导入结果：成功/失败统计 + 失败明细表格 */}
        {importResult && (
          <>
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Statistic title="总行数" value={importResult.imported + importResult.failed} />
              </Col>
              <Col span={8}>
                <Statistic title="成功" value={importResult.imported} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="失败"
                  value={importResult.failed}
                  valueStyle={{ color: importResult.failed > 0 ? '#ff4d4f' : undefined }}
                />
              </Col>
            </Row>
            {importResult.failed > 0 && (
              <Table<ImportErrorRow>
                style={{ marginTop: 16 }}
                size="small"
                rowKey="line"
                columns={ERROR_COLUMNS}
                dataSource={importResult.errors}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
              />
            )}
          </>
        )}
      </Card>

      {/* ── 导出卡片 ── */}
      <Card title="CSV 导出任务">
        <Space wrap>
          <Select
            style={{ width: 320 }}
            allowClear
            loading={projectsQuery.isLoading}
            placeholder="导出范围（不选则导出全部项目任务）"
            options={projectOptions}
            value={exportProjectId}
            onChange={(v) => setExportProjectId(v)}
          />
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            导出 CSV
          </Button>
        </Space>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">导出字段：标题 / 状态 / 优先级 / 截止 / 预估工时 / 实际工时 / 负责人</Text>
        </div>
      </Card>
    </div>
  )
}
