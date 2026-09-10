/**
 * 职责：三态组件之加载中 —— 居中 Spin + 可选文案
 */
import { Spin } from 'antd'

export default function LoadingView({ tip = '加载中…', height = 200 }: { tip?: string; height?: number | string }) {
  return (
    <div className="loading-container" style={{ height, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
      {tip && <div style={{ marginTop: 12, color: 'var(--text-secondary)' }}>{tip}</div>}
    </div>
  )
}