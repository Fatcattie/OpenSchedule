/**
 * 职责：三态组件之错误 —— Alert 错误提示 + 重试按钮 + 可选附加操作
 */
import { Alert, Button, Space } from 'antd'
import type { ReactNode } from 'react'
import { getErrorMessage } from '@/api/errors'

export default function ErrorView({
  error,
  onRetry,
  extra,
}: {
  error?: unknown
  onRetry?: () => void
  extra?: ReactNode
}) {
  return (
    <Alert
      type="error"
      showIcon
      message="加载失败"
      description={
        <div>
          <div>{error ? getErrorMessage(error) : '未知错误'}</div>
          {(onRetry || extra) && (
            <Space style={{ marginTop: 8 }}>
              {onRetry && (
                <Button size="small" onClick={onRetry}>
                  重试
                </Button>
              )}
              {extra}
            </Space>
          )}
        </div>
      }
    />
  )
}
