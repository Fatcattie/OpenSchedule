# OpenSchedule 代码完整度与安全分析报告

- **日期**：2026-11-05
- **范围**：apps/web、apps/mobile、services/api、services/ai、packages/、deploy/、scripts/、.github/（排除 node_modules、dist*、coverage 等产物）
- **方法**：本地静态审查（云端 L4 全量扫描经用户确认取消，依赖 CVE/SCA 未评估，见 §5 局限性）
- **核查**：以下每条安全发现均由人工对照源码逐条复核，证据行号真实可跳转

---

## 1. 总体结论

| 维度 | 结论 |
|---|---|
| 代码完整度 | **中后期实现 + 局部刻意留白**。API 29 个模块、Web 25 页/30 路由、移动端 16 屏、测试 133 个文件；Phase 1 确定性协作闭环（认证/多租户/任务/看板/审计）基本完整。半成品集中在日历 OAuth、Phase2/3 集成、甘特图/里程碑/自动化触发 |
| 安全 | 整体防线设计较好（全局 Guard 默认拒绝、SSRF 守卫、启动占位值阻断、CORS 白名单），但存在 **1 高危 + 5 中危 + 3 低危** 问题，详见 §3 |
| 文档 | readme 严重滞后于实际进度（自述"B1 脚手架阶段"，实际已是中后期） |

---

## 2. 代码完整度分析

### 2.1 未完成标记（TODO/FIXME）分布

apps/web 9 处 · apps/mobile 65 处（其中 63 处为 `// TODO(real-api)` 规范注释，真实分支已调用）· services/api 49 处 · services/ai 12 处 · packages/ 0 处。

最重要的真实留白：

| 位置 | 内容 |
|---|---|
| `services/api/src/modules/calendar/calendar.service.ts:71` | 生成 mock token，OAuth 流程未接（`calendar-adapter.ts:5` 注明"生产环境替换真实实现"） |
| `services/api/src/modules/projects/projects.service.ts:166` | 甘特图 timeline Phase2 占位返回空数组 |
| `services/api/src/modules/projects/projects.controller.ts:54,60` | timeline/milestones Phase2 占位 |
| `services/api/src/modules/comments/mention.parser.ts:2` | @提及解析为正则占位实现 |
| `services/api/src/modules/tasks/tasks.service.ts:654` | TODO(R6) 自动化触发未接入 |
| `services/api/src/modules/assignments/assignments.service.ts:42` | 领取"先到先得"规则写死 |
| `services/ai/app/services/validator.py:309` | LLM 自检待 C20 eval |
| `services/ai/app/services/llm_client.py:40` | 月度花费未持久化 |
| `apps/web/src/components/GanttChart.tsx:72` | 拖拽未接 PATCH |
| `apps/web/src/store/authStore.ts:40` | 刷新恢复 TODO |

### 2.2 桩代码/留白说明（非缺陷）

- **apps/mobile**：`src/config.ts:22` 在 `EXPO_PUBLIC_API_URL` 为空时默认 `USE_MOCK=true` 走 `src/data/seed.ts` 本地演示数据；真实分支 fetch 封装完整。
- **apps/web**：`api/config.ts:13` `USE_MOCK` 默认 false，mock 仅 `VITE_USE_MOCK=true` 时懒加载，生产不触发。
- **services/ai**：空函数体均为 Python Protocol 抽象声明；decompose 三节点图 + 降级逻辑完整；Phase 3 的 execute/emergency 图仅存于注释（`graphs/__init__.py:1`）。
- **IM 通知**：`integrations/adapters/im-adapters.ts:20` 有意的 Mock/OPENAPI/MCP 三通道设计，MCP 不可用降级 Mock。

### 2.3 测试覆盖

services/api 52 · apps/mobile 59 · services/ai 12 · apps/web 10 个测试文件。**缺口：`packages/domain-events` 与 `packages/workspace-rules` 无任何测试**。未发现"路由已注册但实现文件缺失"的断链。

### 2.4 文档与实现偏差

- `readme.md:31` 称"当前处于 B1 脚手架阶段"——明显过时低估。
- `readme.md:19` 称 packages 仅预留 shared-types——实际为 domain-events + workspace-rules。
- `docs/workspace-features.md:13` 自认角色视图前端用 mock 数据，待接 `/auth/me`。
- Phase2 日历 OAuth、Phase3 沙箱/浏览器/Git 集成在文档列出但未落地。

### 2.5 配置完整性

- `.env.example` 共 90 个变量，其中 `GOOGLE_CLIENT_ID`、`FEISHU_APP_ID`、`GITHUB_CLIENT_ID`、`E2B_API_KEY`、`SANDBOX_PROVIDER`、`BROWSER_PROVIDER` 在业务代码中 **0 引用**（只建变量未实现）；`VAPID_PUBLIC_KEY` 仅 1 处、`SMTP_HOST` 仅 2 处使用。
- `deploy/docker-compose.yml` 覆盖完整：postgres/redis/minio/api/web/ai 六服务 + prometheus/grafana/alertmanager 可观测栈，比 readme 承诺更完备。

---

## 3. 安全漏洞发现清单

### 高危

**H-1 AI 服务默认互信 token 绕过启动黑名单**
- 位置：`services/ai/app/config.py:39`、`services/ai/app/main.py:64-73`、`services/api/src/common/startup/startup-guard.ts:19`
- 描述：AI 服务默认 `ai_service_token = "dev-ai-service-token-change-me"`，校验仅判空不判默认值；主服务启动黑名单按**前缀** `change-me` 匹配，拦不住这个以 change-me **结尾**的公开默认串。部署漏配该环境变量时，`/ai/*` 直接接受任何人皆可知的 Bearer token。
- 修复：删除默认值改为必填（缺失即启动失败），并在启动时显式拒绝该已知默认串。

### 中危

**M-1 限流信任可伪造的 X-Forwarded-For，登录爆破防线可绕过**
- 位置：`services/api/src/common/rate-limit/rate-limit.guard.ts:40-44`、`services/api/src/main.ts`
- 描述：无条件取 XFF 首值作为限流 IP，且从未 `app.set('trust proxy', …)`。`auth.controller.ts:25,33,41` 的"5 次/分钟/IP"登录限流可通过每请求伪造不同 XFF 绕过。
- 修复：设置 trust proxy 信任跳数，仅在确认的代理链内解析 XFF，否则用 `req.ip`。

**M-2 AI 侧出站 LLM 请求无 SSRF 守卫**
- 位置：`services/ai/app/services/llm_client.py:128,139`、`services/ai/app/schemas/decompose.py:45`
- 描述：用请求体下发的 `target.base_url` 直接 httpx 请求，仅校验 `^https?://`，httpx 默认跟随重定向；AI 容器可被引导访问内网/云元数据地址。主服务侧有 `url-guard` + `redirect:'error'`（`llm-client.ts:85`），AI 侧缺失同等防护。
- 修复：AI 侧复用同源 SSRF 校验、`follow_redirects=False`，或改由主服务代理出站。

**M-3 url-guard 存在 DNS rebinding TOCTOU 与保留网段缺口**
- 位置：`services/api/src/common/security/url-guard.ts:10-12,50-55`
- 描述：DNS 解析校验后未将实际连接绑定到已校验 IP（校验与请求之间可重绑定，文件头注释也自认"仅校验主机 IP 归属"）；`PRIVATE_V4` 未覆盖 100.64.0.0/10（CGNAT）、198.18.0.0/15（benchmarking）、224.0.0.0/4（组播）。
- 修复：用自定义 `lookup` agent 固定已校验 IP 发起连接；补全保留段。

**M-4 CSV 导出公式注入**
- 位置：`services/api/src/modules/import-export/import-export.service.ts:221`
- 描述：导出 CSV 时 `String(r[h])` 原样写入，`csv.ts` 仅做 RFC4180 引号转义。任务标题等字段填 `=HYPERLINK(...)`、`=cmd|...` 后，管理员用 Excel 打开导出文件即可触发公式执行。
- 修复：对以 `=`、`+`、`-`、`@`、制表符开头的单元格加 `'` 前缀。

**M-5 前端令牌存 localStorage，XSS 可导致长期会话窃取**
- 位置：`apps/mobile/src/services/platform/secureStore.web.ts:21-40`、`apps/web/src/api/config.ts:16-19`
- 描述：Web 平台 refresh token 落 localStorage（文件注释已自认"生产 Web 应由 HttpOnly Cookie 承载"）。当前虽未发现 XSS 注入点，但一旦有单点被利用，refresh token 可被长期窃取。
- 修复：refresh token 改 HttpOnly + SameSite=Strict Cookie，access token 仅存内存。

### 低危

**L-1 移动端演示口令明文硬编码**
- 位置：`apps/mobile/src/services/auth.service.ts:20-23`（`password: 'openschedule'`，:67 明文比对）
- 描述：仅 mock 模式生效，但 `config.ts` 在未配 `EXPO_PUBLIC_API_URL` 时默认启用 mock，存在误打进安装包的风险。
- 修复：production 构建 profile 强制 `USE_MOCK=false` 并在构建期断言。

**L-2 本地 compose 弱默认口令 + Redis 无鉴权映射宿主端口**
- 位置：`deploy/docker-compose.yml:20-22,36-43,59-61,212-214`
- 描述：Postgres 默认 openschedule/openschedule、MinIO minioadmin123、Grafana admin/admin；Redis 无 `requirepass` 且 `6379:6379` 暴露宿主。生产 compose 已用 `${VAR:?}` 收敛，此项限开发环境。
- 修复：开发端口绑定 `127.0.0.1:` 前缀，Redis 加 `requirepass`。

**L-3 杂项**
- `.github/workflows/release.yml:127,176`：`ssh-keyscan … || true` 首次连接 TOFU，失败被吞可被中间人利用。
- `scripts/serve-dist.mjs:99`：`filePath.startsWith(root)` 未补 `path.sep`，兄弟目录（如 `E:\openschedule-evil`）前缀可绕过；仅本地脚本，影响有限。
- `services/api/src/common/middleware/security-headers.middleware.ts:15-25`：有 nosniff/X-Frame-Options/HSTS，但**无 CSP 头**。

---

## 4. 未发现风险的类别（逐类排查结论）

| 类别 | 结论 |
|---|---|
| SQL/命令注入 | 未发现。仅 `health.controller.ts:36,63` 用常量 `$queryRawUnsafe('SELECT 1')`；其余均参数化；Python 侧无 `os.system/subprocess(shell=True)/pickle/yaml.load` |
| eval / new Function | 源码中未发现 |
| XSS | 未发现 `dangerouslySetInnerHTML/innerHTML/document.write` |
| 路径穿越 | 附件/导入导出读的是 multer 临时路径，非用户可控；无 `res.sendFile` |
| 鉴权缺失/越权 | 全局 `APP_GUARD` 默认拒绝（`common.module.ts:75`）；`@Public()` 仅 6 处且各有补偿控制（HMAC 恒定时间比较、限流）；人员域有对象级 `PersonnelAuthzGuard`；未发现信任前端 userId 的 IDOR |
| JWT | secret 全部取自 env、缺失即 500；未发现 alg:none 或硬编码密钥 |
| .env 泄漏 | `.env` 未被 git 跟踪（`.gitignore:19`），内容均为 change-me 占位值 |
| CORS | env 白名单驱动（`main.ts:37-41`），生产拒 `*` 并 fail-fast |
| 调试端点/堆栈泄漏 | 未捕获异常仅回固定 message；`/metrics` 可关闭且部署侧有 Caddy 兜底 |
| CI 机密泄漏 | `ci.yml` 用 `pull_request` 触发（非 `pull_request_target`）；`release.yml` permissions 已收敛 |

**附带观察（非漏洞，影响可审计性）**：`node_modules` 被提交进 git（`git ls-files -- node_modules` = 466,089 个文件，现工作区已改为 vendor 符号链接但历史/索引仍在），导致依赖锁审计与 `pnpm audit` 门禁效果难以核验，建议改为制品库/缓存。

---

## 5. 局限性说明

- 本报告为本地静态审查结论；**依赖组件 CVE（SCA）未扫描**（云端 L4 扫描已取消）。建议后续单独跑 `pnpm audit` / `pip-audit` 或授权云端扫描补齐。
- 未做运行时渗透测试与动态验证，中高危项的利用路径基于代码逻辑推演。

---

## 6. 建议处理优先级

1. **立即**：H-1（AI 默认 token）——改必填 + 拒默认串，一行配置级修复。
2. **本迭代**：M-1（trust proxy）、M-2（AI SSRF 守卫）、M-4（CSV 公式转义）。
3. **排期**：M-3（url-guard 连接绑定 + 网段补全）、M-5（refresh token 迁移 HttpOnly Cookie）、L-3（补 CSP）。
4. **规范**：L-1/L-2 构建与开发环境加固；readme 状态段落更新；packages 两包补测试；`.env.example` 中 6 个无消费变量标注 Phase 归属或删除。
