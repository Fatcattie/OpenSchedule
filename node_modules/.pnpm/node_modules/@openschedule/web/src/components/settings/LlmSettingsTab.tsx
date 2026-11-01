/**
 * LlmSettingsTab —— 设置页「AI 模型」：团队管理员统一配置模型厂商 / 模型 / API Key，全团队共用
 *
 * - key 只在保存时上行一次，服务端加密存储；本页只显示末 4 位，留空保存 = 不修改 key
 * - 「测试连接」用当前表单值（缺省项回落已保存配置）发一次极短请求，直接展示失败原因
 * - 非管理员只读：看到是否已接入与模型名
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Form, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import { ApiOutlined, CheckCircleOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteLlmConfig,
  getLlmConfig,
  listLlmProviders,
  saveLlmConfig,
  testLlmConfig,
  type LlmProviderId,
  type LlmTestResult,
  type SaveLlmConfigInput,
} from '@/api/llmApi'
import { getErrorMessage } from '@/api/errors'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import { AI_STATUS_QUERY_KEY, useAiStatus } from '@/hooks/useAiStatus'

const { Text, Link } = Typography
const CONFIG_QUERY_KEY = ['llm-config'] as const

interface FormValues {
  provider: LlmProviderId
  baseUrl?: string
  model: string
  apiKey?: string
}

export default function LlmSettingsTab() {
  const isAdmin = useCurrentRole() === 'manager'
  return <div style={{ padding: '0 16px 16px' }}>{isAdmin ? <AdminForm /> : <MemberView />}</div>
}

function MemberView() {
  const status = useAiStatus()
  return (
    <Alert
      type={status.enabled ? 'success' : 'info'}
      showIcon
      message={status.enabled ? `团队已接入 AI 模型：${status.providerName ?? ''} ${status.model ?? ''}` : '团队尚未配置 AI 模型'}
      description={
        status.enabled
          ? '项目拆解、AI 规则与智能协助会调用该模型；模型 key 由管理员统一管理。'
          : 'AI 功能当前使用本地规则引擎。如需接入真实模型，请联系团队管理员在此页配置。'
      }
    />
  )
}

function AdminForm() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<FormValues>()
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)

  const providersQuery = useQuery({ queryKey: ['llm-providers'], queryFn: listLlmProviders, staleTime: Infinity })
  const configQuery = useQuery({ queryKey: CONFIG_QUERY_KEY, queryFn: getLlmConfig })
  const config = configQuery.data
  const providers = providersQuery.data ?? []

  const provider = Form.useWatch('provider', form)
  const preset = useMemo(() => providers.find((p) => p.id === provider), [providers, provider])

  useEffect(() => {
    if (!config || providers.length === 0) return
    const initial = (config.provider ?? 'deepseek') as LlmProviderId
    const initialPreset = providers.find((p) => p.id === initial)
    form.setFieldsValue({
      provider: initial,
      baseUrl: config.baseUrl && config.baseUrl !== initialPreset?.baseUrl ? config.baseUrl : undefined,
      model: config.model ?? initialPreset?.models[0] ?? '',
      apiKey: undefined,
    })
  }, [config, providers, form])

  const onProviderChange = (id: LlmProviderId) => {
    const next = providers.find((p) => p.id === id)
    form.setFieldsValue({ baseUrl: undefined, model: next?.models[0] ?? '' })
    setTestResult(null)
  }

  const toInput = (values: FormValues): SaveLlmConfigInput => ({
    provider: values.provider,
    model: values.model.trim(),
    ...(values.baseUrl?.trim() ? { baseUrl: values.baseUrl.trim() } : {}),
    ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: AI_STATUS_QUERY_KEY })
  }

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => saveLlmConfig(toInput(values)),
    onSuccess: () => {
      form.setFieldValue('apiKey', undefined)
      refresh()
      message.success('AI 模型配置已保存，全团队即刻生效')
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const testMutation = useMutation({
    mutationFn: (values: FormValues) => testLlmConfig(toInput(values)),
    onSuccess: setTestResult,
    onError: (err) => setTestResult({ ok: false, kind: 'error', message: getErrorMessage(err) }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLlmConfig,
    onSuccess: () => {
      refresh()
      setTestResult(null)
      message.success('已清除 AI 模型配置，AI 功能回落本地规则引擎')
    },
    onError: (err) => message.error(getErrorMessage(err)),
  })

  const runTest = async () => {
    const values = await form.validateFields(['provider', 'model', 'baseUrl'])
    testMutation.mutate({ ...values, apiKey: form.getFieldValue('apiKey') })
  }

  const isCustom = provider === 'custom'
  const keyRequired = !config?.configured

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        由管理员统一配置，全团队共用；项目拆解、AI 规则与智能协助都会调用该模型。未配置时这些功能使用本地规则引擎。
      </Text>

      {config?.configured ? (
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 20 }}>
          <Descriptions.Item label="状态">
            <Tag color="green" icon={<CheckCircleOutlined />}>已接入</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="厂商 / 模型">{config.providerName} · {config.model}</Descriptions.Item>
          <Descriptions.Item label="接口地址">{config.baseUrl}</Descriptions.Item>
          <Descriptions.Item label="API Key">••••••••{config.keyLast4}</Descriptions.Item>
          {config.updatedAt && <Descriptions.Item label="更新时间">{new Date(config.updatedAt).toLocaleString()}</Descriptions.Item>}
        </Descriptions>
      ) : (
        <Alert type="info" showIcon message="尚未配置 AI 模型" style={{ marginBottom: 20 }} />
      )}

      <Form form={form} layout="vertical" style={{ maxWidth: 560 }} onFinish={(values) => saveMutation.mutate(values)}>
        <Form.Item label="模型厂商" name="provider" rules={[{ required: true, message: '请选择厂商' }]}>
          <Select
            onChange={onProviderChange}
            loading={providersQuery.isLoading}
            options={providers.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Form.Item>

        <Form.Item
          label="接口地址（Base URL）"
          name="baseUrl"
          extra={isCustom ? '填写 OpenAI 兼容接口地址，如 https://llm.example.com/v1' : `留空使用默认：${preset?.baseUrl ?? ''}`}
          rules={[{ required: isCustom, message: '自定义厂商必须填写接口地址' }]}
        >
          <Input placeholder={preset?.baseUrl || 'https://'} allowClear />
        </Form.Item>

        <Form.Item label="模型" name="model" rules={[{ required: true, message: '请填写模型名' }]}>
          <AutoComplete
            options={(preset?.models ?? []).map((m) => ({ value: m }))}
            placeholder="如 deepseek-chat"
            filterOption={false}
          />
        </Form.Item>

        <Form.Item
          label="API Key"
          name="apiKey"
          rules={[{ required: keyRequired, message: '首次配置必须填写 API Key' }]}
          extra={
            <Space size={4}>
              <span>{config?.configured ? `已保存 ••••${config.keyLast4}，留空则不修改。` : '仅保存时上传一次，服务端加密存储。'}</span>
              {preset?.consoleUrl && (
                <Link href={preset.consoleUrl} target="_blank" rel="noopener noreferrer">
                  <LinkOutlined /> 去申请
                </Link>
              )}
            </Space>
          }
        >
          <Input.Password placeholder={config?.configured ? '留空不修改' : 'sk-...'} autoComplete="new-password" />
        </Form.Item>

        {testResult && (
          <Alert
            type={testResult.ok ? 'success' : 'error'}
            showIcon
            style={{ marginBottom: 16 }}
            message={testResult.ok ? `连接成功：${testResult.model}（${testResult.latencyMs} ms）` : '连接失败'}
            description={testResult.ok ? undefined : testResult.message}
          />
        )}

        <Space wrap>
          <Button icon={<ApiOutlined />} loading={testMutation.isPending} onClick={runTest}>
            测试连接
          </Button>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
            保存配置
          </Button>
          {config?.configured && (
            <Popconfirm
              title="清除 AI 模型配置？"
              description="清除后 AI 功能回落本地规则引擎，已保存的 key 会被删除。"
              onConfirm={() => deleteMutation.mutate()}
            >
              <Button danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
                清除配置
              </Button>
            </Popconfirm>
          )}
        </Space>
      </Form>
    </>
  )
}
