/**
 * 职责：登录页 —— 邮箱/密码表单提交、错误展示（Alert）、成功后跳转项目列表（mock 模式：任意邮箱可登录，密码 error 演示错误分支）
 * R6-1/R7：真实模式下 mustChangePassword=true（管理员代建账号）时提示强制改密并跳转个人资料页
 */
import { useRef, useState } from 'react'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Navigate, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/authApi'
import { USE_MOCK } from '@/api/config'
import { getErrorMessage } from '@/api/errors'
import { useAuthStore } from '@/stores/authStore'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAccessToken = useAuthStore((s) => s.setAccessToken)
  const setUser = useAuthStore((s) => s.setUser)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // R6-1：刚登录（本页触发的 setAccessToken）时不立即被下方 <Navigate to="/workspace"> 抢跳，以 navigate 目标（含强制改密 /profile）为准
  const justLoggedIn = useRef(false)

  // 已登录直接进入时间日历工作台（本页刚完成登录时除外）
  if (accessToken && !justLoggedIn.current) return <Navigate to="/workspace" replace />

  const onFinish = async (values: { email: string; password: string }) => {
    setSubmitting(true)
    setError(null)
    try {
      const tokens = await authApi.login({ email: values.email, password: values.password })
      justLoggedIn.current = true
      setAccessToken(tokens.accessToken)
      // 拉取当前用户（含所属租户/角色），随后进入项目列表
      const me = await authApi.fetchMe()
      setUser({ ...me.user, roles: me.roles })
      // R6-1：管理员代建账号首次登录（mustChangePassword=true）→ 强制改密流程（个人资料页修改密码）
      navigate(tokens.mustChangePassword ? '/profile?forceChangePassword=1' : '/workspace', { replace: true })
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fa',
      }}
    >
      <Card style={{ width: 400, boxShadow: '0 6px 24px rgba(0,0,0,0.08)' }}>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          OpenSchedule
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          团队协作 · 个人计划 · AI 增强
        </Text>
        {error && <Alert type="error" showIcon message="登录失败" description={error} style={{ marginBottom: 16 }} />}
        {USE_MOCK && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Mock 模式"
            description="任意邮箱可登录；密码填 error 可查看错误提示。真实模式需后端（VITE_USE_MOCK 默认已关，可临时置 true 走 mock）。"
          />
        )}
        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少 8 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
