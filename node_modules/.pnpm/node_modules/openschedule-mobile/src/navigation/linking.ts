/**
 * 职责：深链配置（ARCH §5）—— openschedule://task/:taskId 直达任务详情。
 *
 * 深链清单（根栈扁平字符串 + Tabs 嵌套）：
 *   - 根栈共享页（扁平，位于 Tabs 之上）：/task/:taskId、/notifications、
 *     /submit、/create、/personal-plan、/my-submissions（增量 1 新增 4 条）
 *   - Tabs 嵌套：/workspace、/today、/projects、/projects/:projectId、/time、/me、
 *     /me/notification-settings、/me/about
 *
 * 关键约束（往返一致性）：Tabs 下每个 Tab 都是「内嵌 native-stack」，因此链接配置必须为
 * 每个 Tab 给出**显式的嵌套 screens**，使 URL 生成（getPathFromState）与 URL 解析
 * （getStateFromPath）共用同一套映射。
 *
 * 背景（首次修复）：若某个 Tab 只写成字符串（如 `Me: 'me'`），React Navigation 生成 URL 时
 * 会追加内层屏名（→ `/me/Profile`），但解析该两段式路径时无子屏配置可匹配，返回 undefined，
 * 于是直达 URL 静默回退到初始态（工作台）。
 *
 * 本次修复（消除冗余段）：为让 URL 与项目 Tab（干净的 `/projects`）保持一致，把每个 Tab 的
 * **根屏 path 置为空字符串 `''`**——这是 React Navigation 支持的标准写法：内层 navigator 的
 * 初始路由不占用路径段，于是 `/me` 即落在其初始屏 Profile；多段子屏统一改为 **kebab-case 小写**。
 *   - 生成：`/me`、`/me/notification-settings`、`/me/about`
 *   - 解析：同上；tab 根 `/me` 亦可达（落在其初始屏 Profile）
 * 单屏 Tab（Workspace / Today / Time）同理：`/workspace`、`/today`、`/time`。
 *
 * 注意：URL 约定已变更，旧形态 `/me/Profile`、`/time/Calendar`、`/workspace/Workspace`、
 * `/today/TodayFocus` 不再被注册，解析返回 undefined（预期行为，见 tests/linking.test.ts B5）。
 */
import type { LinkingOptions } from '@react-navigation/native'
import type { MainRootStackParamList } from '@/types'

/** 深链配置：与 app.json 的 scheme（openschedule）保持一致 */
export const linking: LinkingOptions<MainRootStackParamList> = {
  prefixes: ['openschedule://', 'https://app.openschedule.dev'],
  config: {
    screens: {
      Tabs: {
        screens: {
          // 工作台栈：根屏 Workspace 不占路径段 → /workspace
          Workspace: {
            path: 'workspace',
            screens: {
              Workspace: '',
            },
          },
          // 今日栈：根屏 TodayFocus 不占路径段 → /today
          Today: {
            path: 'today',
            screens: {
              TodayFocus: '',
            },
          },
          // 项目栈：ProjectList → /projects，Board → /projects/:projectId（保持不变）
          Project: {
            screens: {
              ProjectList: 'projects',
              Board: 'projects/:projectId',
            },
          },
          // 时间栈：根屏 Calendar 不占路径段 → /time
          Time: {
            path: 'time',
            screens: {
              Calendar: '',
            },
          },
          // 我的栈：根屏 Profile → /me；子屏 kebab-case → /me/notification-settings、/me/about
          Me: {
            path: 'me',
            screens: {
              Profile: '',
              NotificationSettings: 'notification-settings',
              About: 'about',
            },
          },
        },
      },
      // 通知 data.taskId → openschedule://task/<id>（保持不变）
      TaskDetail: 'task/:taskId',
      Notifications: 'notifications',
      // 增量 1 根栈共享页：与 TaskDetail / Notifications 同级的**扁平字符串**，
      // 不可嵌入 Tabs（历史缺陷修复要点：根栈页若误嵌入 Tabs 会破坏往返一致性）
      Submission: 'submit',
      CreateItem: 'create',
      PersonalPlan: 'personal-plan',
      MySubmissions: 'my-submissions',
      AuditCenter: 'audit-center',
    },
  },
}
