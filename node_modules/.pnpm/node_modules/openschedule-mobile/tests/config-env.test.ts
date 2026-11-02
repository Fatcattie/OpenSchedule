/**
 * 职责：服务层配置的环境变量解析 —— API 源站拼接、mock 开关三态默认值。
 * `config.ts` 在模块加载期读取 env，故每例改 env 后 `jest.resetModules()` 再 require。
 */
type Config = typeof import('@/services/config')

const KEYS = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_USE_MOCK'] as const
const saved: Record<string, string | undefined> = {}

function load(env: Partial<Record<(typeof KEYS)[number], string>>): Config {
  for (const key of KEYS) {
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@/services/config') as Config
}

beforeAll(() => {
  for (const key of KEYS) saved[key] = process.env[key]
})

afterAll(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  jest.resetModules()
})

describe('API_BASE', () => {
  it('未配置源站 → 相对路径（Expo Web 同源）', () => {
    expect(load({}).API_BASE).toBe('/api/v1')
  })

  it('配置源站 → 绝对地址，去尾斜杠与空白', () => {
    expect(load({ EXPO_PUBLIC_API_URL: ' https://schedule.example.com/ ' }).API_BASE).toBe(
      'https://schedule.example.com/api/v1',
    )
  })
})

describe('USE_MOCK', () => {
  it('未配置任何变量 → mock（本地演示）', () => {
    expect(load({}).USE_MOCK).toBe(true)
  })

  it('仅配置源站 → 真实后端', () => {
    expect(load({ EXPO_PUBLIC_API_URL: 'https://schedule.example.com' }).USE_MOCK).toBe(false)
  })

  it('显式 true 优先于源站', () => {
    expect(
      load({ EXPO_PUBLIC_API_URL: 'https://schedule.example.com', EXPO_PUBLIC_USE_MOCK: 'true' })
        .USE_MOCK,
    ).toBe(true)
  })

  it('显式 false 即使无源站也走真实后端', () => {
    expect(load({ EXPO_PUBLIC_USE_MOCK: 'false' }).USE_MOCK).toBe(false)
  })
})
