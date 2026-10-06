/// <reference types="jest" />
/**
 * 职责：测试环境准备 —— 为纯逻辑测试提供最小 RN/Expo 依赖替身。
 * 仅测试侧生效，不影响运行时。
 */

// AsyncStorage 内存替身（useTimer 持久化测试用）
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>()
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (store.has(key) ? (store.get(key) as string) : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key)
      }),
      clear: jest.fn(async () => {
        store.clear()
      }),
    },
  }
})
