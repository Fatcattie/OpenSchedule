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

来源：[`docs/code-analysis-report.md`](docs/code-analysis-report.md)（2026-11-05 本地静态审查）。2026-11-08 已全部修复，回归测试见 `services/api/src/common/security/security-hardening.spec.ts`、`services/ai/tests/test_security_hardening.py`、`apps/web/src/utils/securityHardening.test.ts`。

| 编号 | 级别 | 问题 | 修复方式 | 状态 |
|---|---|---|---|---|
| H-1 | 高 | AI 服务默认互信 token 绕过启动黑名单 | AI 服务 `APP_ENV=production` 时 token 为空或含 change-me 即拒绝启动；主服务黑名单由前缀匹配改为包含匹配 | ✅ 已修复 |
| M-1 | 中 | 限流信任可伪造的 `X-Forwarded-For` | 新增 `TRUST_PROXY`（生产 compose 设为 1，只信任 Caddy 这一跳），限流只用 `req.ip` | ✅ 已修复 |
| M-2 | 中 | AI 侧出站 LLM 请求无 SSRF 守卫 | `SafeAsyncTransport`：解析并校验全部 IP 后把连接固定到已校验 IP（Host/SNI 不变）；不跟随重定向 | ✅ 已修复 |
| M-3 | 中 | url-guard DNS rebinding TOCTOU 与保留网段缺口 | 改为基于 `net.BlockList` 匹配，补全 CGNAT / 基准测试 / 组播 / NAT64 / 6to4 等网段；新增 `safeFetch` / `safeHttpsAgent` 在连接时校验 DNS 结果，LLM 调用与 Web Push 默认使用 | ✅ 已修复 |
| M-4 | 中 | CSV 导出公式注入 | 三处导出（import-export、reports、Web `downloadCsv`）对 `= + - @ 	 ` 开头的单元格加 `'` 前缀；导入时还原，往返不变 | ✅ 已修复 |
| M-5 | 中 | refresh token 存 localStorage | Web：refresh token 改由 HttpOnly + SameSite=Strict Cookie 承载（`X-Auth-Transport: cookie`），access token 只存内存，刷新页面时用 Cookie 恢复会话；Expo Web 改为只存内存；原生端不变（SecureStore） | ✅ 已修复 |
| L-1 | 低 | 移动端 mock 演示口令可能被打进安装包 | `app.config.ts`：EAS production 构建如果 mock 未关闭或缺少 `EXPO_PUBLIC_API_URL`，直接构建失败 | ✅ 已修复 |
| L-2 | 低 | 开发 compose 弱口令 + Redis 端口暴露 | 宿主端口默认只绑定 `127.0.0.1`（`DEV_BIND_HOST` 可覆盖），开发口令与无鉴权 Redis 不再暴露到局域网 | ✅ 已修复 |
| L-3 | 低 | 缺 CSP；ssh-keyscan TOFU；serve-dist 路径前缀绕过 | API 与 SPA（nginx）下发 CSP；发布流水线改为固定主机指纹（`DEPLOY_KNOWN_HOSTS` / `PROD_DEPLOY_KNOWN_HOSTS`）并开启 `StrictHostKeyChecking=yes`；serve-dist 改用 `path.relative` 判定 | ✅ 已修复 |

### 部署方需要完成的配置

- GitHub Secrets 新增 `DEPLOY_KNOWN_HOSTS`、`PROD_DEPLOY_KNOWN_HOSTS`：内容为目标机的 known_hosts 行。在可信网络执行 `ssh-keyscan -H <host>`，与服务器上 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 的指纹核对一致后再存入。未配置时部署 job 会报错退出。
- EAS 的 production 环境需配置 `EXPO_PUBLIC_API_URL`，否则生产构建会失败。
- 经 Caddy 以外的代理链部署时，需按实际跳数设置 `TRUST_PROXY`。

另外：依赖组件的 CVE 扫描（SCA）尚未执行，建议补跑 `pnpm audit` 与 `pip-audit`。
