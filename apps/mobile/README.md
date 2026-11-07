# OpenSchedule 移动端（apps/mobile）

React Native + Expo + TypeScript（严格模式）实现的 OpenSchedule 移动端首版，覆盖「登录 → 工作台 → 今日聚焦 → 项目看板 → 任务详情 → 时间容器 → 我的」核心 7 页闭环。

视觉为「浅色高级商务风」：象牙白 / 浅灰底 + 深墨蓝主色，大留白、克制排版、描边 + 低阴影双层卡片。

---

## 一、启动命令

> 包管理统一使用 **npm**（本机未安装 pnpm，请勿使用 `pnpm` / `pnpm-lock.yaml`）。

```bash
cd apps/mobile
npm install            # 首次安装依赖

npm start              # Expo 开发服务器（Expo Go 扫码运行）
npm run android        # Android 模拟器 / 真机
npm run ios            # iOS 模拟器（需 macOS）
npm run web            # 浏览器运行（Metro Web）

npm run typecheck      # npx tsc --noEmit
npm run export:web     # npx expo export --platform web → 产出 dist/
```

首次进入登录页后可使用演示账号（登录页底部有「点击填入」）：

| 账号 | 密码 |
| --- | --- |
| `zhangwei@example.com` | `openschedule` |

---

## 二、目录说明

```
apps/mobile/
├── App.tsx                  # 根组件：SafeAreaProvider + AppProvider + RootNavigator
├── index.ts                 # Expo 入口（registerRootComponent）
├── app.json                 # Expo 配置（scheme: openschedule / 深链 / 图标）
├── babel.config.js          # babel-preset-expo + module-resolver（@/ 别名）
├── tsconfig.json            # strict + paths(@/*)
├── eas.json                 # EAS Build 预留 profile（首版不构建）
└── src/
    ├── theme/               # 设计 token（唯一来源）+ 状态/优先级配色映射
    ├── types/               # DTO 类型 + 状态机常量 + 导航路由参数
    ├── data/                # 本地 mock 种子（时间随演示当日滚动）
    ├── services/            # 服务层（USE_MOCK 开关 + 真实 API 调用位）
    │   └── platform/        # 原生能力适配（secureStore / biometrics，含 .web.ts 平台分支）
    ├── store/               # AppProvider：会话 / 角色 / 偏好 / 乐观更新登记
    ├── hooks/               # useAsync / useAuth / useTimer / useSwipeAction / usePressScale
    ├── components/          # UI 原语 + 业务组件（含 FadeIn 入场动画容器）
    ├── navigation/          # RootNavigator / MainTabs / stacks / linking（深链）
    ├── screens/             # 11 个页面
    └── utils/               # date.ts（UTC→user.timezone）/ format.ts（工时 / 相对时间）
```

### 关键约定

| 项 | 约定 |
| --- | --- |
| 导入别名 | `@/` → `src/`（tsconfig `paths` + babel `module-resolver` 双保险） |
| 样式 | 一律 `StyleSheet.create` + 引用 `src/theme/tokens.ts`；**禁止内联魔法数字** |
| 时间 | 存储 / 传输 ISO8601 UTC，渲染统一按 `user.timezone` 换算（`utils/date.ts`，兜底 `Asia/Shanghai`） |
| 三态 | 所有列表页使用 `LoadingView`（骨架屏）/ `EmptyState` / `ErrorState` |
| 乐观锁 | 所有状态 / 排序写操作携带 `version`；40901 → 提示并 `refetch`；40902 → 用 `allowed_transitions` 校正 |
| 乐观更新 | 仅「今日聚焦右滑」与「看板状态流转」使用，登记到 `AppProvider` 以支持撤销 |

---

## 三、Mock 与真实 API 切换

服务层统一由 `src/services/config.ts` 的 `USE_MOCK` 与 `API_BASE` 控制，取值来自环境变量（模板见 `.env.example`）：

| 变量 | 作用 |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | 后端源站（如 `https://schedule.example.com`，不含 `/api/v1`）。**真机/模拟器必填**，相对路径只在 Expo Web 同源部署时可用 |
| `EXPO_PUBLIC_USE_MOCK` | `true`/`false` 显式指定；留空时 = 配了 `EXPO_PUBLIC_API_URL` 走真实后端，否则走 mock |
| `EAS_PROJECT_ID` | EAS 项目 ID 覆盖值；留空 = 内置默认 `@bigcatleos-team/openschedule`（`c728f5e8-…`，见 `app.config.ts`） |

- **默认（mock）**：所有读接口返回本地 `src/data` 种子数据；所有写接口在内存库上生效，并保留 `// TODO(real-api): <METHOD> <path>` 调用位与 `version` 字段。
- **本地连真实后端**：

```bash
# Windows (PowerShell)；真机调试本机后端时用电脑局域网 IP
$env:EXPO_PUBLIC_API_URL="http://192.168.1.10:3000"; npm start

# macOS / Linux
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000 npm start
```

- **EAS 构建**：项目已关联 `@bigcatleos-team/openschedule`；`eas.json` 的 preview/production profile 已固定 `EXPO_PUBLIC_USE_MOCK=false`；源站用 EAS 环境变量设置：

```bash
eas env:set --name EXPO_PUBLIC_API_URL --value https://你的域名 --environment production --visibility plaintext
```

真实模式下请求经 `src/services/client.ts` 发出：注入 `Authorization: Bearer <token>`、解包 `ApiResponse<T>`、把错误归一化为 `ApiError`（含 40901 乐观锁 / 40902 非法迁移），401 触发 `unauthorizedHandler` 清空会话回到登录页。请求地址为 `${EXPO_PUBLIC_API_URL}/api/v1`（`API_BASE`）。

---

## 四、已知限制

1. **无真实后端**：首版零后端依赖，写操作走本地 mock 成功路径；接后端仅需切换 `USE_MOCK`。
2. **推送**：首版仅站内通知 + 轮询，未接入 Expo Push / 厂商通道。
3. **看板拖拽**：状态流转采用「卡片菜单 → 底部抽屉」切换，未实现长按拖拽（与 PRD Q3 默认方案一致）。
4. **Web 端生物识别不可用**：`expo-local-authentication` 通过 `platform/biometrics.web.ts` 平台分支隔离，Web 端自动回落密码登录。
5. **Web 端 token 存储**：`expo-secure-store` 在 Web 无实现，降级为 `localStorage`（仅演示用；生产 Web 应由 HttpOnly Cookie 承载）。
6. **时间容器**：仅实现日 / 周视图（08:00–20:00），月 / 年视图按 PRD 收敛不做。
7. **AI 提议**：仅支持查看草稿摘要 + 确认 / 驳回，移动端不提供 AI 生成入口。
8. **「登录成功品牌区离场动画」**：根导航为声明式切换（`isAuthenticated`），登录页改为「品牌区入场淡入 + 错误横向抖动」，未做离场动画。
9. **看板撤销边界**：撤销流转时若反向迁移在状态机中非法，则回滚本地乐观态并 `refetch`，以服务端真实状态为准。

---

## 五、验证状态

```bash
npx tsc --noEmit                  # 0 错误
npx expo export --platform web    # 成功产出 dist/
```

依赖版本（由 `create-expo-app` / `npm install` 实际解析，非手写）：

| 包 | 版本 |
| --- | --- |
| expo | 57.0.22 |
| react-native | 0.86.3 |
| react | 19.2.3 |
| @react-navigation/* | 7.x |
| typescript | 6.0.3 |
