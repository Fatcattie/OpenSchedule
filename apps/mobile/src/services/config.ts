/**
 * 职责：服务层统一配置 —— API 前缀、mock 开关、存储 key、mock 延迟区间（对齐 Web 端 config.ts）。
 */

/** REST 统一前缀 */
export const API_BASE = '/api/v1'

/**
 * Mock 开关（默认开，保证后端未就绪时页面不白屏）：
 * - 默认走 mock；接真实后端时设 `EXPO_PUBLIC_USE_MOCK=false` 即可，无需改页面代码。
 */
export const USE_MOCK: boolean = process.env.EXPO_PUBLIC_USE_MOCK !== 'false'

/** token 存储 key（native 走 SecureStore / web 走 localStorage） */
export const TOKEN_KEYS = {
  access: 'os.access_token',
  refresh: 'os.refresh_token',
} as const

/** 偏好持久化 key（AsyncStorage） */
export const PREFERENCE_KEYS = {
  /** 「记住我」标记 */
  rememberMe: 'os.remember_me',
  /** 演示角色 */
  role: 'os.role',
  /** 最近一次登录邮箱（记住我时回填） */
  lastEmail: 'os.last_email',
  /** 主题三态偏好（`'system' | 'light' | 'dark'`，独立单值键，增量 10） */
  themeMode: 'os.theme_mode',
  /** 语言三态偏好（`'zh-CN' | 'en-US' | 'system'`，独立单值键，增量 12） */
  locale: 'os.locale',
} as const

/** 草稿持久化 key（AsyncStorage，M2-P2-02） */
export const DRAFT_KEYS = {
  /** 提报页表单草稿 */
  submission: 'os.draft_submission',
} as const

/** 缓存 key（AsyncStorage，增量 8）：完整 key = `os.cache.<userId>:<role>.<域内 key>` */
export const CACHE_KEYS = {
  /** 缓存 key 前缀 */
  prefix: 'os.cache.',
  /** 缓存索引 key（记录已缓存条目，供容量管理 / 清空，不依赖 getAllKeys） */
  index: 'os.cache.__index__',
} as const

/** 缓存容量上限（增量 8 · A4，可按实测调整） */
export const CACHE_LIMITS = {
  /** 条目数上限 */
  maxEntries: 50,
  /** 总体积上限（字节，按序列化字符数近似） */
  maxBytes: 512 * 1024,
} as const

/** mock 请求延迟区间（毫秒），模拟真实网络抖动，便于观察骨架屏 */
export const MOCK_LATENCY = {
  min: 160,
  max: 420,
} as const

/** 默认租户时区（兜底，R6） */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai'
