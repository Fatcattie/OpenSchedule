/**
 * alert-bridge 测试（node --test deploy/observability/alert-bridge/server.test.mjs）
 * 用真实 HTTP：起桥 + 起假机器人服务端，模拟 Alertmanager 投递，断言消息格式、签名与失败重试语义。
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import {
  MAX_TEXT_LENGTH,
  buildRequest,
  createBridgeServer,
  dingtalkSign,
  feishuSign,
  formatAlertText,
  isBusinessError,
  resolveChannels,
} from './server.mjs'

const firingPayload = {
  version: '4',
  status: 'firing',
  receiver: 'im-bridge',
  groupLabels: { alertname: 'ApiDown' },
  commonLabels: { alertname: 'ApiDown', severity: 'critical', service: 'openschedule-api' },
  alerts: [
    {
      status: 'firing',
      labels: { alertname: 'ApiDown', severity: 'critical', service: 'openschedule-api', instance: 'api:3000' },
      annotations: { summary: 'OpenSchedule API 抓取失败', description: '连续 1 分钟无法抓取 api:3000' },
      startsAt: '2026-10-20T02:00:00Z',
      endsAt: '0001-01-01T00:00:00Z',
    },
  ],
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

describe('纯函数', () => {
  it('resolveChannels 只收录已配置的通道', () => {
    assert.deepEqual(resolveChannels({}), [])
    const channels = resolveChannels({ ALERT_FEISHU_WEBHOOK: 'https://f', ALERT_WECOM_WEBHOOK: ' https://w ' })
    assert.deepEqual(
      channels.map((c) => [c.kind, c.url]),
      [
        ['feishu', 'https://f'],
        ['wecom', 'https://w'],
      ],
    )
  })

  it('formatAlertText：触发消息含级别/摘要/对象/北京时间', () => {
    const text = formatAlertText(firingPayload)
    assert.match(text, /^🚨【严重】ApiDown（触发 1 · 恢复 0）/)
    assert.match(text, /OpenSchedule API 抓取失败/)
    assert.match(text, /对象：openschedule-api \/ api:3000/)
    assert.match(text, /开始：2026\/10\/20 10:00:00/)
    assert.match(text, /docs\/ops\/runbook\.md/)
  })

  it('formatAlertText：恢复消息显示起止时间', () => {
    const text = formatAlertText({
      ...firingPayload,
      status: 'resolved',
      alerts: [{ ...firingPayload.alerts[0], status: 'resolved', endsAt: '2026-10-20T02:05:00Z' }],
    })
    assert.match(text, /^✅【已恢复】ApiDown/)
    assert.match(text, /10:00:00 → 2026\/10\/20 10:05:00/)
  })

  it('formatAlertText：超长截断', () => {
    const many = { ...firingPayload, alerts: Array.from({ length: 50 }, () => firingPayload.alerts[0]) }
    const text = formatAlertText(many)
    assert.ok(text.length <= MAX_TEXT_LENGTH)
    assert.match(text, /已截断/)
  })

  it('飞书签名与官方算法一致（key=ts\\nsecret，空消息）', () => {
    const expected = createHmac('sha256', '1700000000\nsec').update('').digest('base64')
    assert.equal(feishuSign(1700000000, 'sec'), expected)
    const { body } = buildRequest({ kind: 'feishu', url: 'https://f', secret: 'sec' }, 'hi', {}, 1700000000_123)
    assert.deepEqual(body, { msg_type: 'text', content: { text: 'hi' }, timestamp: '1700000000', sign: expected })
  })

  it('钉钉加签拼到 URL（key=secret，消息=ts\\nsecret）', () => {
    const ts = 1700000000123
    const expected = createHmac('sha256', 'sec').update(`${ts}\nsec`).digest('base64')
    assert.equal(dingtalkSign(ts, 'sec'), expected)
    const { url, body } = buildRequest(
      { kind: 'dingtalk', url: 'https://d/robot/send?access_token=t', secret: 'sec' },
      'hi',
      {},
      ts,
    )
    assert.equal(url, `https://d/robot/send?access_token=t&timestamp=${ts}&sign=${encodeURIComponent(expected)}`)
    assert.deepEqual(body, { msgtype: 'text', text: { content: 'hi' } })
  })

  it('无密钥时不加签；通用 webhook 原样转发', () => {
    assert.deepEqual(buildRequest({ kind: 'feishu', url: 'https://f' }, 'hi', {}).body, {
      msg_type: 'text',
      content: { text: 'hi' },
    })
    assert.equal(buildRequest({ kind: 'dingtalk', url: 'https://d?x=1' }, 'hi', {}).url, 'https://d?x=1')
    assert.equal(buildRequest({ kind: 'webhook', url: 'https://g' }, 'hi', firingPayload).body, firingPayload)
  })

  it('识别机器人 HTTP 200 内的业务失败', () => {
    assert.equal(isBusinessError('feishu', { code: 0 }), false)
    assert.equal(isBusinessError('feishu', { code: 19021, msg: 'sign match fail' }), true)
    assert.equal(isBusinessError('feishu', { StatusCode: 0 }), false)
    assert.equal(isBusinessError('dingtalk', { errcode: 310000 }), true)
    assert.equal(isBusinessError('wecom', { errcode: 0 }), false)
    assert.equal(isBusinessError('webhook', { errcode: 1 }), false)
  })
})

describe('HTTP 端到端（假机器人）', () => {
  const received = []
  let robotBehaviour = 'ok'
  let robot
  let robotPort

  before(async () => {
    robot = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        received.push({ path: req.url, body: JSON.parse(raw) })
        res.writeHead(200, { 'content-type': 'application/json' })
        if (robotBehaviour === 'bizfail' && req.url.startsWith('/feishu')) {
          res.end(JSON.stringify({ code: 19021, msg: 'sign match fail' }))
        } else res.end(JSON.stringify(req.url.startsWith('/feishu') ? { code: 0 } : { errcode: 0 }))
      })
    })
    robotPort = await listen(robot)
  })

  after(() => robot.close())

  async function withBridge(channels, fn) {
    const bridge = createBridgeServer({ channels })
    const port = await listen(bridge)
    try {
      await fn(`http://127.0.0.1:${port}`)
    } finally {
      bridge.close()
    }
  }

  it('Alertmanager 投递 → 三个机器人都收到同一条文本，返回 200', async () => {
    received.length = 0
    robotBehaviour = 'ok'
    const base = `http://127.0.0.1:${robotPort}`
    const channels = resolveChannels({
      ALERT_FEISHU_WEBHOOK: `${base}/feishu`,
      ALERT_FEISHU_SECRET: 's1',
      ALERT_DINGTALK_WEBHOOK: `${base}/dingtalk?access_token=t`,
      ALERT_DINGTALK_SECRET: 's2',
      ALERT_WECOM_WEBHOOK: `${base}/wecom`,
    })
    await withBridge(channels, async (url) => {
      const health = await (await fetch(`${url}/health`)).json()
      assert.deepEqual(health.channels, ['feishu', 'dingtalk', 'wecom'])

      const res = await fetch(`${url}/alertmanager`, { method: 'POST', body: JSON.stringify(firingPayload) })
      assert.equal(res.status, 200)
      const { delivered } = await res.json()
      assert.ok(delivered.every((d) => d.ok))
    })
    assert.equal(received.length, 3)
    const feishu = received.find((r) => r.path === '/feishu')
    assert.match(feishu.body.content.text, /ApiDown/)
    assert.ok(feishu.body.sign && feishu.body.timestamp)
    const ding = received.find((r) => r.path.startsWith('/dingtalk'))
    assert.match(ding.path, /&timestamp=\d+&sign=/)
    assert.match(ding.body.text.content, /ApiDown/)
    assert.match(received.find((r) => r.path === '/wecom').body.text.content, /ApiDown/)
  })

  it('任一通道业务失败 → 502（交给 Alertmanager 重试）', async () => {
    robotBehaviour = 'bizfail'
    const base = `http://127.0.0.1:${robotPort}`
    const channels = resolveChannels({ ALERT_FEISHU_WEBHOOK: `${base}/feishu`, ALERT_WECOM_WEBHOOK: `${base}/wecom` })
    await withBridge(channels, async (url) => {
      const res = await fetch(`${url}/alertmanager`, { method: 'POST', body: JSON.stringify(firingPayload) })
      assert.equal(res.status, 502)
      const { delivered } = await res.json()
      assert.deepEqual(
        delivered.map((d) => [d.kind, d.ok]),
        [
          ['feishu', false],
          ['wecom', true],
        ],
      )
      assert.match(delivered[0].error, /业务错误/)
    })
  })

  it('通道不可达 → 502；无通道 → 200 只记日志；坏 JSON → 400；未知路径 → 404', async () => {
    await withBridge([{ kind: 'wecom', url: 'http://127.0.0.1:1/unreachable' }], async (url) => {
      const res = await fetch(`${url}/alertmanager`, { method: 'POST', body: JSON.stringify(firingPayload) })
      assert.equal(res.status, 502)
    })
    await withBridge([], async (url) => {
      assert.equal((await fetch(`${url}/alertmanager`, { method: 'POST', body: '{}' })).status, 200)
      assert.equal((await fetch(`${url}/alertmanager`, { method: 'POST', body: 'not json' })).status, 400)
      assert.equal((await fetch(`${url}/nope`)).status, 404)
    })
  })
})
