/**
 * 职责：useTimer hook 测试（B）—— 计时纯计算、暂停累计、退出重进恢复（持久化）。
 * 依据 ARCH T04 验收「useTimer 退出重进保持计时」与 M-P0-11。
 */
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act } from 'react-test-renderer'
import TestRenderer from 'react-test-renderer'
import { DEMO_USER_IDS, resetDatabase } from '@/data'
import { useTimer, type UseTimerResult } from '@/hooks/useTimer'

const ME = DEMO_USER_IDS.me

let latest: UseTimerResult

/** 测试载体：把 hook 返回值暴露到模块级变量 */
function Harness({ taskId, userId }: { taskId: string; userId: string }): null {
  latest = useTimer(taskId, userId)
  return null
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function render(taskId: string): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(<Harness taskId={taskId} userId={ME} />)
  })
  await act(async () => {
    await flush()
  })
  return renderer
}

beforeEach(async () => {
  resetDatabase()
  await AsyncStorage.clear()
})

describe('useTimer —— 初始与纯计算', () => {
  it('初始未计时，恢复完成后 restoring=false、seconds=0', async () => {
    const renderer = await render('task-001')
    expect(latest.restoring).toBe(false)
    expect(latest.running).toBe(false)
    expect(latest.seconds).toBe(0)
    await act(async () => {
      renderer.unmount()
    })
  })

  it('开始后 running=true 且秒数随时间递增（纯计算 baseSeconds + 已过秒）', async () => {
    const renderer = await render('task-001')
    await act(async () => {
      await latest.start()
    })
    expect(latest.running).toBe(true)
    expect(latest.entryId).not.toBeNull()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    })
    expect(latest.seconds).toBeGreaterThanOrEqual(1)

    await act(async () => {
      await latest.stop()
    })
    await act(async () => {
      renderer.unmount()
    })
  })

  it('暂停保留累计秒数，running 置 false', async () => {
    const renderer = await render('task-001')
    await act(async () => {
      await latest.start()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100))
    })
    const beforePause = latest.seconds
    await act(async () => {
      await latest.pause()
    })
    expect(latest.running).toBe(false)
    expect(latest.seconds).toBeGreaterThanOrEqual(beforePause)
    await act(async () => {
      renderer.unmount()
    })
  })
})

describe('useTimer —— 持久化恢复（退出重进保持计时）', () => {
  it('计时中卸载再挂载，running / entryId 保持不变', async () => {
    const first = await render('task-002')
    await act(async () => {
      await latest.start()
    })
    const entryId = latest.entryId
    expect(latest.running).toBe(true)

    // 模拟退出页面
    await act(async () => {
      first.unmount()
    })

    // 模拟重新进入
    const second = await render('task-002')
    expect(latest.running).toBe(true)
    expect(latest.entryId).toBe(entryId)

    await act(async () => {
      await latest.stop()
    })
    await act(async () => {
      second.unmount()
    })
  })

  it('持久化 key 为 os.timer.<taskId>', async () => {
    const renderer = await render('task-003')
    await act(async () => {
      await latest.start()
    })
    const raw = await AsyncStorage.getItem('os.timer.task-003')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).running).toBe(true)
    await act(async () => {
      await latest.stop()
    })
    await act(async () => {
      renderer.unmount()
    })
  })

  it('损坏的持久化数据按未计时处理（不抛错）', async () => {
    await AsyncStorage.setItem('os.timer.task-004', '{bad json')
    const renderer = await render('task-004')
    expect(latest.running).toBe(false)
    expect(latest.restoring).toBe(false)
    await act(async () => {
      renderer.unmount()
    })
  })
})
