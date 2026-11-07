# 安全策略（Security Policy）

## 支持范围

| 分支 / 版本 | 是否接收安全修复 |
|---|---|
| `main`（最新） | ✅ |
| 历史 tag / 旧部署 | ❌（请升级到 `main` 最新版本） |

覆盖组件：`services/api`、`services/ai`、`apps/web`、`apps/mobile`、`packages/*`、`deploy/`、`.github/workflows/`。

## 如何上报漏洞

**请不要在公开 Issue、PR 或讨论区披露漏洞细节。**

1. 通过 GitHub 私密通道上报：仓库页面 → **Security** → **Report a vulnerability**（GitHub Private Vulnerability Reporting）。
2. 报告中请尽量包含：
   - 受影响组件与文件位置（路径 + 行号，或接口路径）
   - 漏洞类型与影响（越权、注入、SSRF、信息泄漏等）
   - 复现步骤或 PoC（最小化即可，请勿对他人部署的实例做破坏性测试）
   - 你建议的修复方式（可选）

## 处理流程与时限

| 阶段 | 目标时限 |
|---|---|
| 确认收到 | 3 个工作日内 |
| 初步定级（高 / 中 / 低） | 7 个工作日内 |
| 修复发布 | 高危 14 天内；中危 30 天内；低危随常规迭代 |
| 公开披露 | 修复发布后，与报告者协商时间点 |

定级参照：

- **高危**：无需认证即可越权、绕过鉴权、读取他人租户数据、远程执行代码。
- **中危**：需要特定条件才能利用，或只影响单个用户 / 单个租户的问题（限流绕过、SSRF、注入到下游工具等）。
- **低危**：纵深防御缺失、只影响开发环境的配置、需要高权限才能利用的问题。

修复流程：在私有分支修复 → 补对应的回归测试（`services/api/test`、`services/ai/tests` 或 `tests/security`）→ CI 全绿后合入 `main` → 通过 `release.yml` 发布 → 更新下方「已知问题跟踪」。

## 已知问题跟踪

来源：[`docs/code-analysis-report.md`](docs/code-analysis-report.md)（2026-11-05 本地静态审查；状态于 2026-11-08 对照源码复核）。

| 编号 | 级别 | 问题 | 位置 | 状态 |
|---|---|---|---|---|
| H-1 | 高 | AI 服务默认互信 token（`dev-ai-service-token-change-me`）绕过主服务按前缀匹配的启动黑名单 | `services/ai/app/config.py:39`、`services/api/src/common/startup/startup-guard.ts:19` | 🔴 未修复 |
| M-1 | 中 | 限流无条件信任 `X-Forwarded-For`，未设置 `trust proxy`，登录限流可被伪造 IP 绕过 | `services/api/src/common/rate-limit/rate-limit.guard.ts:40-44` | 🔴 未修复 |
| M-2 | 中 | AI 侧出站 LLM 请求无 SSRF 守卫，且 httpx 会跟随重定向 | `services/ai/app/services/llm_client.py:128,139` | 🔴 未修复 |
| M-3 | 中 | url-guard 存在 DNS rebinding TOCTOU 问题；未覆盖 CGNAT / benchmarking / 组播保留网段 | `services/api/src/common/security/url-guard.ts` | 🔴 未修复 |
| M-4 | 中 | CSV 导出存在公式注入（`=`、`+`、`-`、`@` 开头的单元格未转义） | `services/api/src/modules/import-export/import-export.service.ts:221` | 🔴 未修复 |
| M-5 | 中 | Web 端 refresh token 存在 localStorage，一旦有 XSS 即可被长期窃取 | `apps/web/src/api/config.ts`、`apps/mobile/src/services/platform/secureStore.web.ts` | 🔴 未修复 |
| L-1 | 低 | 移动端 mock 演示口令硬编码，未配 API 地址时默认启用 mock | `apps/mobile/src/services/auth.service.ts:20-23` | 🔴 未修复 |
| L-2 | 低 | 本地 compose 使用弱默认口令，Redis 无鉴权且映射到宿主端口（仅开发环境） | `deploy/docker-compose.yml` | 🔴 未修复 |
| L-3 | 低 | 缺 CSP 头；`ssh-keyscan` 首次连接信任（TOFU）；`serve-dist` 路径前缀校验未补 `path.sep` | 见报告 §3 L-3 | 🔴 未修复 |

建议修复顺序：H-1 → M-1 / M-2 / M-4 → M-3 / M-5 / L-3 → L-1 / L-2。

另外：依赖组件的 CVE 扫描（SCA）尚未执行，建议补跑 `pnpm audit` 与 `pip-audit`。
