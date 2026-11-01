/**
 * llm-client：OpenAI 兼容调用（请求形状 / 温度钳制 / 不跟随重定向）+ 错误分类（不回显 key 与上游响应体）。
 */
import { describe, expect, it, vi } from 'vitest'
import { LlmCallError, chatCompletion, classifyStatus } from './llm-client'

const TARGET = { baseUrl: 'https://api.deepseek.com/v1/', apiKey: 'sk-secret-key-1234', model: 'deepseek-chat' }

function okResponse(content = 'hello') {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], model: 'deepseek-chat-0324', usage: { prompt_tokens: 3, completion_tokens: 5 } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('chatCompletion', () => {
  it('POST {baseUrl}/chat/completions，Bearer 鉴权，温度钳制到 0.2，不跟随重定向', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const out = await chatCompletion(TARGET, { prompt: 'hi', system: 'sys', temperature: 0.9, maxTokens: 8 }, fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init.headers.authorization).toBe('Bearer sk-secret-key-1234')
    expect(init.redirect).toBe('error')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ model: 'deepseek-chat', temperature: 0.2, max_tokens: 8, stream: false })
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ])
    expect(out).toEqual({ text: 'hello', model: 'deepseek-chat-0324', usage: { promptTokens: 3, completionTokens: 5 } })
  })

  it('HTTP 401 → auth，消息不含 key 与上游响应体', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"error":"Bearer sk-secret-key-1234 invalid"}', { status: 401 }))
    const err = await chatCompletion(TARGET, { prompt: 'x' }, fetchImpl).catch(e => e)
    expect(err).toBeInstanceOf(LlmCallError)
    expect(err.kind).toBe('auth')
    expect(err.message).not.toContain('sk-secret')
  })

  it('超时 → timeout；网络错误 → unreachable（只带主机名）', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' })
    await expect(chatCompletion(TARGET, { prompt: 'x' }, vi.fn().mockRejectedValue(timeout))).rejects.toMatchObject({ kind: 'timeout' })
    const err = await chatCompletion(TARGET, { prompt: 'x' }, vi.fn().mockRejectedValue(new TypeError('fetch failed'))).catch(e => e)
    expect(err.kind).toBe('unreachable')
    expect(err.message).toContain('api.deepseek.com')
  })

  it('非 JSON / 缺 choices → invalid_response', async () => {
    await expect(
      chatCompletion(TARGET, { prompt: 'x' }, vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))),
    ).rejects.toMatchObject({ kind: 'invalid_response' })
    await expect(
      chatCompletion(TARGET, { prompt: 'x' }, vi.fn().mockResolvedValue(new Response('{"ok":1}', { status: 200 }))),
    ).rejects.toMatchObject({ kind: 'invalid_response' })
  })
})

describe('classifyStatus', () => {
  it.each([
    [200, null],
    [401, 'auth'],
    [403, 'auth'],
    [402, 'auth'],
    [429, 'rate_limited'],
    [404, 'bad_request'],
    [400, 'bad_request'],
    [503, 'upstream'],
  ])('%i → %s', (status, kind) => {
    const err = classifyStatus(status)
    expect(err?.kind ?? null).toBe(kind)
  })
})
