/**
 * MiniCharts —— 零依赖轻量图表套件（纯 SVG + AntD Token）
 *
 * 不引入外部图表库，避免包体积膨胀；所有配色取自 theme token，暗色/亮色自适应。
 * 覆盖：折线面积图、柱状/条形图、环形图、漏斗图、热力图、直方图、双轴图、堆叠条形图。
 */
import { theme } from 'antd'
import { Tooltip } from 'antd'

export interface Datum {
  label: string
  value: number
}

export interface NamedDatum extends Datum {
  color?: string
}

// ========== 折线 / 面积图 ==========
export function LineAreaChart({
  data,
  height = 200,
  color,
  showDots = true,
}: {
  data: Datum[]
  height?: number
  color?: string
  showDots?: boolean
}) {
  const { token } = theme.useToken()
  const c = color ?? token.colorPrimary
  const W = 600
  const H = height
  const pad = { t: 12, r: 12, b: 24, l: 36 }
  const max = Math.max(...data.map((d) => d.value), 1)
  const n = Math.max(data.length, 1)
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(n - 1, 1)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `${pad.l},${H - pad.b} ${pts} ${x(n - 1)},${H - pad.b}`
  const ticks = 4

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max / ticks) * i
        return (
          <g key={i}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke={token.colorBorderSecondary}
              strokeWidth={0.5}
            />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill={token.colorTextDescription}>
              {Math.round(v)}
            </text>
          </g>
        )
      })}
      <polygon points={area} fill={c} opacity={0.14} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
      {showDots &&
        data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={3} fill={token.colorBgContainer} stroke={c} strokeWidth={1.5} />
        ))}
      {data.map((d, i) =>
        i % Math.ceil(n / 8) === 0 ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={token.colorTextDescription}>
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// ========== 柱状 / 条形图 ==========
export function BarChart({
  data,
  height = 200,
  horizontal = false,
  color,
  reference,
}: {
  data: Datum[]
  height?: number
  horizontal?: boolean
  color?: string
  /** 基准线（如容量 40h） */
  reference?: number
}) {
  const { token } = theme.useToken()
  const c = color ?? token.colorPrimary
  const W = 600
  const H = height
  const max = Math.max(...data.map((d) => d.value), reference ?? 0, 1)

  if (horizontal) {
    const pad = { t: 8, r: 40, b: 8, l: 72 }
    const rowH = (H - pad.t - pad.b) / Math.max(data.length, 1)
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
        {data.map((d, i) => {
          const y = pad.t + i * rowH
          const w = ((W - pad.l - pad.r) * d.value) / max
          const over = reference != null && d.value > reference
          return (
            <g key={i}>
              <text x={pad.l - 8} y={y + rowH / 2 + 3} textAnchor="end" fontSize={11} fill={token.colorTextSecondary}>
                {d.label}
              </text>
              <rect x={pad.l} y={y + rowH * 0.2} width={Math.max(w, 1)} height={rowH * 0.6} rx={3} fill={over ? token.colorError : c} />
              <text x={pad.l + w + 6} y={y + rowH / 2 + 3} fontSize={11} fill={over ? token.colorError : token.colorTextSecondary}>
                {d.value}
              </text>
            </g>
          )
        })}
      </svg>
    )
  }

  const pad = { t: 12, r: 12, b: 28, l: 36 }
  const slot = (W - pad.l - pad.r) / Math.max(data.length, 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      {Array.from({ length: 5 }, (_, i) => {
        const v = (max / 4) * i
        const y = H - pad.b - (v / max) * (H - pad.t - pad.b)
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={token.colorBorderSecondary} strokeWidth={0.5} />
            <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize={10} fill={token.colorTextDescription}>
              {Math.round(v)}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * (H - pad.t - pad.b)
        const x = pad.l + i * slot + slot * 0.2
        const w = slot * 0.6
        return (
          <g key={i}>
            <rect x={x} y={H - pad.b - h} width={w} height={Math.max(h, 1)} rx={3} fill={c} />
            <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize={10} fill={token.colorTextDescription}>
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ========== 环形图 ==========
export function DonutChart({ data, size = 200 }: { data: NamedDatum[]; size?: number }) {
  const { token } = theme.useToken()
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2 - 18
  const cx = size / 2
  const cy = size / 2
  let acc = 0
  const palette = [token.colorPrimary, token.colorSuccess, token.colorWarning, token.colorError, token.colorInfo]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={token.colorFillSecondary} strokeWidth={22} />
        {data.map((d, i) => {
          const frac = d.value / total
          const circumference = 2 * Math.PI * r
          const dash = frac * circumference
          const offset = -acc * circumference
          acc += frac
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color ?? palette[i % palette.length]}
              strokeWidth={22}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={600} fill={token.colorText}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill={token.colorTextDescription}>
          总计
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: d.color ?? palette[i % palette.length],
                display: 'inline-block',
              }}
            />
            <span style={{ color: token.colorTextSecondary }}>{d.label}</span>
            <strong style={{ color: token.colorText }}>{d.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== 漏斗图 ==========
export function FunnelChart({ data, height = 200 }: { data: NamedDatum[]; height?: number }) {
  const { token } = theme.useToken()
  const W = 600
  const H = height
  const max = Math.max(...data.map((d) => d.value), 1)
  const step = H / Math.max(data.length, 1)
  const palette = [token.colorPrimary, token.colorInfo, token.colorWarning, token.colorError]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
      {data.map((d, i) => {
        const wTop = ((W - 160) * d.value) / max
        const wBottom = i + 1 < data.length ? ((W - 160) * data[i + 1].value) / max : wTop * 0.75
        const y0 = i * step + 4
        const y1 = (i + 1) * step - 4
        const cx = W / 2
        const fill = d.color ?? palette[i % palette.length]
        return (
          <g key={i}>
            <polygon
              points={`${cx - wTop / 2},${y0} ${cx + wTop / 2},${y0} ${cx + wBottom / 2},${y1} ${cx - wBottom / 2},${y1}`}
              fill={fill}
              opacity={0.85}
            />
            <text x={cx} y={(y0 + y1) / 2 + 4} textAnchor="middle" fontSize={11} fill="#fff">
              {d.label} {d.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ========== 热力图（行 × 列） ==========
export function HeatmapChart({
  rows,
  cols,
  values,
  height = 200,
}: {
  rows: string[]
  cols: string[]
  /** values[rowIndex][colIndex] */
  values: number[][]
  height?: number
}) {
  const { token } = theme.useToken()
  const max = Math.max(...values.flat(), 1)
  const cell = (v: number) => {
    if (v <= 0) return 'transparent'
    const r = v / max
    if (r > 0.7) return `${token.colorError}66`
    if (r > 0.4) return `${token.colorWarning}4d`
    if (r > 0.2) return `${token.colorInfo}33`
    return `${token.colorSuccess}26`
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: token.colorBgContainer }} />
            {cols.map((c) => (
              <th key={c} style={{ fontWeight: 500, color: token.colorTextSecondary, padding: 2 }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <td
                style={{
                  position: 'sticky',
                  left: 0,
                  background: token.colorBgContainer,
                  paddingRight: 8,
                  whiteSpace: 'nowrap',
                  color: token.colorTextSecondary,
                }}
              >
                {r}
              </td>
              {cols.map((c, j) => {
                const v = values[i]?.[j] ?? 0
                return (
                  <Tooltip key={c} title={`${r} · ${c}：${v}`}>
                    <td
                      style={{
                        width: 34,
                        height: Math.max(20, height / Math.max(rows.length, 1) - 4),
                        background: cell(v),
                        borderRadius: 3,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        textAlign: 'center',
                        color: v > 0 ? token.colorText : token.colorTextQuaternary,
                      }}
                    >
                      {v > 0 ? v : ''}
                    </td>
                  </Tooltip>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ========== 直方图（分布） ==========
export function HistogramChart({ data, height = 200, color }: { data: Datum[]; height?: number; color?: string }) {
  return <BarChart data={data} height={height} color={color} />
}

// ========== 双轴图（柱 + 折线） ==========
export function DualAxisChart({
  data,
  barLabel,
  lineLabel,
  height = 220,
}: {
  data: { label: string; bar: number; line: number }[]
  barLabel: string
  lineLabel: string
  height?: number
}) {
  const { token } = theme.useToken()
  const W = 600
  const H = height
  const pad = { t: 16, r: 44, b: 28, l: 40 }
  const maxBar = Math.max(...data.map((d) => d.bar), 1)
  const maxLine = Math.max(...data.map((d) => d.line), 1)
  const slot = (W - pad.l - pad.r) / Math.max(data.length, 1)
  const yLine = (v: number) => H - pad.b - (v / maxLine) * (H - pad.t - pad.b)
  const pts = data.map((d, i) => `${pad.l + i * slot + slot / 2},${yLine(d.line)}`).join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke={token.colorBorder} strokeWidth={0.5} />
        {data.map((d, i) => {
          const h = (d.bar / maxBar) * (H - pad.t - pad.b)
          const x = pad.l + i * slot + slot * 0.22
          const w = slot * 0.56
          return (
            <g key={i}>
              <rect x={x} y={H - pad.b - h} width={w} height={Math.max(h, 1)} rx={3} fill={token.colorPrimary} opacity={0.75} />
              <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize={10} fill={token.colorTextDescription}>
                {d.label}
              </text>
            </g>
          )
        })}
        <polyline points={pts} fill="none" stroke={token.colorWarning} strokeWidth={2} />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={pad.l + i * slot + slot / 2}
            cy={yLine(d.line)}
            r={3}
            fill={token.colorBgContainer}
            stroke={token.colorWarning}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: token.colorPrimary, borderRadius: 2, display: 'inline-block' }} />
          {barLabel}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: token.colorWarning, borderRadius: 2, display: 'inline-block' }} />
          {lineLabel}
        </span>
      </div>
    </div>
  )
}

// ========== 堆叠条形图（横向） ==========
export interface StackedSegment {
  key: string
  value: number
  color?: string
}

export interface StackedDatum {
  label: string
  segments: StackedSegment[]
}

export function StackedBarChart({
  data,
  height = 120,
  showLegend = true,
}: {
  data: StackedDatum[]
  height?: number
  showLegend?: boolean
}) {
  const { token } = theme.useToken()
  const palette = [
    token.colorPrimary,
    token.colorSuccess,
    token.colorWarning,
    token.colorError,
    token.colorInfo,
    token.colorTextQuaternary,
  ]
  const W = 600
  const H = height
  const pad = { t: 8, r: 40, b: 8, l: 80 }
  const rowH = (H - pad.t - pad.b) / Math.max(data.length, 1)
  const max = Math.max(
    ...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)),
    1,
  )

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img">
        {data.map((d, i) => {
          const y = pad.t + i * rowH + rowH * 0.25
          const barH = rowH * 0.5
          let x = pad.l
          const total = d.segments.reduce((s, seg) => s + seg.value, 0)
          return (
            <g key={i}>
              <text
                x={pad.l - 8}
                y={y + barH / 2 + 3}
                textAnchor="end"
                fontSize={11}
                fill={token.colorTextSecondary}
              >
                {d.label}
              </text>
              {d.segments.map((seg, j) => {
                const w = (seg.value / max) * (W - pad.l - pad.r)
                const color = seg.color ?? palette[j % palette.length]
                const segment = (
                  <rect
                    key={j}
                    x={x}
                    y={y}
                    width={Math.max(w, 0)}
                    height={barH}
                    rx={j === 0 || j === d.segments.length - 1 ? 3 : 0}
                    fill={color}
                    opacity={0.9}
                  />
                )
                x += w
                return segment
              })}
              <text
                x={pad.l + ((total / max) * (W - pad.l - pad.r)) + 6}
                y={y + barH / 2 + 3}
                fontSize={11}
                fill={token.colorTextSecondary}
              >
                {total}
              </text>
            </g>
          )
        })}
      </svg>
      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 6, fontSize: 12, paddingLeft: pad.l }}>
          {Array.from(
            new Map(
              data.flatMap((d) => d.segments).map((seg, i) => [seg.key, seg.color ?? palette[i % palette.length]]),
            ).entries(),
          ).map(([key, color]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
              <span style={{ color: token.colorTextSecondary }}>{key}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
