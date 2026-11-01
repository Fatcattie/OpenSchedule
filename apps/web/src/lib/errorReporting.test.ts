import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_EVENTS_PER_MINUTE,
  buildEnvelope,
  buildEvent,
  captureException,
  initErrorReporting,
  installGlobalHandlers,
  isErrorReportingEnabled,
  parseDsn,
  parseStackFrames,
  resetErrorReportingForTest,
  resolveOptions,
  scrubMessage,
  stripQuery,
} from './errorReporting'

const DSN = 'https://abc123@o1.ingest.sentry.io/42'

function setup(now = () => 1_000_000) {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  const options = resolveOptions({ sentryDsn: DSN, environment: 'staging', release: 'v1.2.3' }, {})
  initErrorReporting(options, { fetch: fetch as unknown as typeof globalThis.fetch, now })
  return fetch
}

function sentEvent(fetch: ReturnType<typeof vi.fn>, call = 0): Record<string, any> {
  const body = fetch.mock.calls[call][1].body as string
  return JSON.parse(body.trim().split('\n')[2])
}

afterEach(() => resetErrorReportingForTest())

describe('parseDsn / resolveOptions', () => {
  it('解析出 envelope 地址并以查询串携带 sentry_key（CORS 简单请求）', () => {
    const dsn = parseDsn(DSN)!
    expect(dsn.publicKey).toBe('abc123')
    expect(dsn.envelopeUrl).toMatch(/^https:\/\/o1\.ingest\.sentry\.io\/api\/42\/envelope\/\?/)
    expect(dsn.envelopeUrl).toContain('sentry_key=abc123')
    expect(dsn.envelopeUrl).toContain('sentry_version=7')
  })

  it('支持自建实例的路径前缀', () => {
    expect(parseDsn('https://k@sentry.example.com/prefix/7')!.envelopeUrl).toMatch(
      /^https:\/\/sentry\.example\.com\/prefix\/api\/7\/envelope\//,
    )
  })

  it.each(['', '   ', 'not a url', 'https://o1.ingest.sentry.io/42', 'https://k@host/abc'])(
    '非法 DSN %j → null',
    (raw) => expect(parseDsn(raw)).toBeNull(),
  )

  it('运行时注入优先于构建期变量；都缺失 → null（no-op）', () => {
    expect(resolveOptions({ sentryDsn: DSN }, { VITE_SENTRY_DSN: 'https://x@h/1' })!.publicKey).toBe('abc123')
    expect(resolveOptions({}, { VITE_SENTRY_DSN: 'https://x@h/1', MODE: 'development' })!.environment).toBe(
      'development',
    )
    expect(resolveOptions({ sentryDsn: '' }, {})).toBeNull()
    expect(resolveOptions(undefined, {})).toBeNull()
  })

  it('空 release 不发送', () => {
    expect(resolveOptions({ sentryDsn: DSN, release: '' }, {})).not.toHaveProperty('release')
  })
})

describe('纯函数', () => {
  it('scrubMessage 遮蔽 Bearer/JWT/密钥', () => {
    const out = scrubMessage(
      'Bearer abc.def token=xyz eyJaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc ' + 'a'.repeat(40),
    )
    expect(out).not.toMatch(/abc\.def|xyz|eyJa|a{40}/)
  })

  it('stripQuery 去掉查询串与片段', () => {
    expect(stripQuery('https://h/p?token=1#x')).toBe('https://h/p')
    expect(stripQuery('https://h/p')).toBe('https://h/p')
  })

  it('解析 Chrome 与 Firefox/Safari 两种栈格式，最早调用在前', () => {
    const chrome = parseStackFrames(
      'Error: x\n    at inner (https://app/assets/a.js:1:10)\n    at https://app/assets/b.js?v=1:2:20',
    )
    expect(chrome.map((f) => f.filename)).toEqual(['https://app/assets/b.js', 'https://app/assets/a.js'])
    expect(chrome[1]).toMatchObject({ function: 'inner', lineno: 1, colno: 10, in_app: true })

    const gecko = parseStackFrames('inner@https://app/assets/a.js:3:4\n@https://app/assets/b.js:5:6')
    expect(gecko).toHaveLength(2)
    expect(gecko[1]).toMatchObject({ function: 'inner', lineno: 3, colno: 4 })
  })

  it('扩展程序帧标记为非应用代码', () => {
    expect(parseStackFrames('    at x (chrome-extension://id/c.js:1:1)')[0].in_app).toBe(false)
  })

  it('事件体：环境/release/标签齐备，页面 URL 不含查询串', () => {
    const options = resolveOptions({ sentryDsn: DSN, environment: 'prod', release: 'v1' }, {})!
    const event = buildEvent(new TypeError('boom password=hunter2'), { mechanism: 'window.error' }, options, {
      url: 'https://app/tasks/1?invite=secret',
      userAgent: 'UA',
    })
    expect(event).toMatchObject({
      platform: 'javascript',
      environment: 'prod',
      release: 'v1',
      tags: { service: 'openschedule-web', mechanism: 'window.error' },
      request: { url: 'https://app/tasks/1' },
    })
    const exc = (event.exception as any).values[0]
    expect(exc.type).toBe('TypeError')
    expect(exc.value).not.toContain('hunter2')
    expect(exc.mechanism).toEqual({ type: 'window.error', handled: false })
  })

  it('Envelope 为三行：信封头 / item 头 / 事件', () => {
    const lines = buildEnvelope({ event_id: 'e1' }).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).event_id).toBe('e1')
    expect(JSON.parse(lines[1]).type).toBe('event')
  })
})

describe('captureException', () => {
  it('未初始化时完全 no-op', () => {
    const fetch = vi.fn()
    initErrorReporting(null, { fetch })
    captureException(new Error('x'), { mechanism: 'window.error' })
    expect(isErrorReportingEnabled()).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('以 text/plain + keepalive 发往 envelope 地址，不带凭据', () => {
    const fetch = setup()
    captureException(new Error('boom'), { mechanism: 'window.error' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toContain('/api/42/envelope/')
    expect(init).toMatchObject({
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
    })
    expect(sentEvent(fetch)).toMatchObject({ environment: 'staging', release: 'v1.2.3' })
  })

  it('同消息 60s 内去重', () => {
    const fetch = setup()
    captureException(new Error('same'), { mechanism: 'window.error' })
    captureException(new Error('same'), { mechanism: 'window.error' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it(`每分钟最多 ${MAX_EVENTS_PER_MINUTE} 条，跨窗口恢复`, () => {
    let t = 0
    const fetch = setup(() => t)
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE + 5; i++) captureException(new Error(`e${i}`), { mechanism: 'x' })
    expect(fetch).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE)
    t = 61_000
    captureException(new Error('later'), { mechanism: 'x' })
    expect(fetch).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE + 1)
  })

  it('整条栈来自浏览器扩展 → 丢弃', () => {
    const fetch = setup()
    const err = new Error('ext')
    err.stack = 'Error: ext\n    at x (chrome-extension://id/c.js:1:1)'
    captureException(err, { mechanism: 'window.error' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('传输失败静默，不抛给调用方', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    initErrorReporting(resolveOptions({ sentryDsn: DSN }, {}), { fetch })
    expect(() => captureException(new Error('x'), { mechanism: 'x' })).not.toThrow()
    await Promise.resolve()
  })
})

describe('installGlobalHandlers', () => {
  it('上报 window.error 与 unhandledrejection；忽略跨域 Script error.', () => {
    const fetch = setup()
    const uninstall = installGlobalHandlers(window)
    try {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught'), message: 'uncaught' }))
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
      const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
      Object.defineProperty(rejection, 'reason', { value: new Error('rejected') })
      window.dispatchEvent(rejection)
    } finally {
      uninstall()
    }
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sentEvent(fetch, 0).tags.mechanism).toBe('window.error')
    expect(sentEvent(fetch, 1).tags.mechanism).toBe('unhandledrejection')
  })
})
