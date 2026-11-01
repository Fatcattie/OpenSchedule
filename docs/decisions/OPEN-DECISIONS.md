# OPEN-DECISIONS 登记册（OpenSchedule 生产化 DDD）

> **纪律**：本登记册是 append-only、resolved-in-place —— 条目关闭时把 `## OPEN` 改为 `## RESOLVED` 并补 `- **Resolution**:`，永不删除痕迹。
> 未在此登记的关键决策一律视为未决，不得在代码里默认拍板。
> 权威依据：`docs/ddd/production-ddd-design.md`（§6 决策表 D-01…D-11）、`services/api/prisma/schema.prisma`、`docs/contracts/personnel-permission-matrix.md`。

**Category 取值**：`waiting-on-external-condition` | `design-decision-to-evaluate` | `existing-design-boundary`

---

## RESOLVED — design-decision-to-evaluate — D-01 双鉴权体系收敛
- **Date**: 2026-09-29（决）/ 2026-10-10（落）
- **Source**: production-ddd-design.md §6.1 D-01；交付计划步骤 s1
- **Open item**: JWT Bearer（modules/auth）与 cookie 会话（middleware/authz.ts + PersonnelAuthService）双鉴权并存，安全面翻倍；需选定收敛方案
- **Related constraints**: 人员域前端走独立 `sessionClient`（HttpOnly cookie + 内存 CSRF）；决策影响 R4/R7 批次
- **Current leaning**: 方案 A（全部收敛为 JWT Bearer）
- **Blocked by**: 无
- **Resolves when**: 交付计划确认默认值并登记；代码 R7-6 完成（sessionClient/CSRF/PersonnelAuthService 全部删除）
- **Resolution**: 采纳文档建议默认 **方案 A：全部收敛为 JWT Bearer**，删除 cookie 会话与 CSRF 体系；人员域前端改造并入 R7 数据体系收敛。依据：安全面最小化，改造成本约 2 天（§6.1 D-01 备注）。
- **Status**: 代码已落地（2026-10-10）—— `PersonnelAuthzGuard` 仅依赖 `req.user`，`sessionClient`/`X-CSRF-Token`/`PersonnelAuthService`/`services/auth.service.ts`/`middleware/personnel-session.guard.ts` 全删；OpenAPI 4 个切片 `sessionCookie → bearerAuth`；`tests/authz/privilege-escalation` 23 断言组 + 63 矩阵格 + `tests/authz/tenant-isolation` 5 例均绿；证据见 `docs/ddd/production-progress.md` §R7-6。

## RESOLVED — design-decision-to-evaluate — D-05 成员 onboarding 方案
- **Date**: 2026-09-29
- **Source**: production-ddd-design.md §6.1 D-05、§3.2 邀请加入端点；交付计划步骤 s1
- **Open item**: 成员 onboarding 闭环：A. 邀请制（邀请 token + 邮件）vs B. 管理员代建账号 + 首次登录改密
- **Related constraints**: 首发零外部依赖优先；邀请邮件依赖 D-04 邮件供应商 POC
- **Current leaning**: 方案 B（首发），A 列 P2
- **Blocked by**: 无
- **Resolves when**: 交付计划确认默认值并登记
- **Resolution**: 采纳文档建议默认 **方案 B：管理员代建账号 + 首次登录改密**（零外部依赖，不阻塞首发）；邀请制（邀请 token + 邮件流转）列入 P2，待 D-04 邮件供应商 POC 通过后启动。影响批次：R6。

## RESOLVED — design-decision-to-evaluate — D-07 localStorage 演示体系处置
- **Date**: 2026-09-29
- **Source**: production-ddd-design.md §6.1 D-07、§3.9；交付计划步骤 s1
- **Open item**: 前端三套并行数据体系中的 localStorage 演示体系（协作工作台任务/Wiki/SOP/经验/提示词/Skill/MetaSkill/心情，`os_ws_v1_*` 键）处置：A. 转真实后端建模（6 组新表）vs B. 功能下线/隐藏
- **Related constraints**: `USE_MOCK` 默认开为最大技术债；localStorage 角色切换必须以 `/auth/me` capabilities 为准移除；上线前本地模拟点必须清零（§4.1 门禁）
- **Current leaning**: B + 保留 Wiki 转 A（文档 §6.1 倾向）
- **Blocked by**: 无
- **Resolves when**: 交付计划确认默认值并登记
- **Resolution**: 采纳文档建议默认 **B（下线/隐藏）为主、保留 Wiki 转 A（后端建模）**：工作台任务等演示域功能首发下线，Wiki 域走真实后端表；localStorage 角色切换与全部本地模拟点（改密码/IM 转发/aiGenerator 模板/useCurrentRole）R7 清零。影响批次：R7。
- **Revised（2026-10-17，用户拍板）**：改为 **A. 全部后端建模，分两期**。一期（已完成，见 production-progress.md §R8-7）：通用工作台文档存储 `workspace_items`（租户/集合/属主/条目键唯一，JSONB + 条目级乐观锁），14 个 localStorage 集合全部落库，前端 `useWorkspaceState` 同签名替换；业务规则（审批流/评审/提报/SOP 生成）仍在前端执行。二期（上线前必做审批部分）：按 DDD 把审批状态机等规则迁到服务端实体表，堵住「成员可直接写审批状态」的信任缺口。
- **二期方案（2026-10-18，用户拍板）**：采用「服务端审批命令 + 写入守卫」而非关系表全量实体化——数据仍在 `workspace_items`；规则沉淀为共享包 `packages/workspace-rules`（服务端执行，mock 演示模式复用）；通过/驳回/撤回只能走 `POST /workspace/tasks/:id/review`；批量写经逐条守卫。已完成，见 production-progress.md §R8-8。关系表实体化不再列为上线前置。

## RESOLVED — design-decision-to-evaluate — D-02/D-08 生产编排形态
- **Date**: 2026-09-29
- **Source**: production-ddd-design.md §6.1 D-02/D-08；交付计划步骤 s1
- **Open item**: 生产部署编排形态：A. 单机 compose 生产版（5-50 人团队规模）vs B. k8s；部署目标（云主机 Docker / 云托管 K8s / 私有化交付）与之联动
- **Related constraints**: SLO 可用性目标 99.5% 匹配单机形态；k8s 列 P2；compose 当前为本地开发栈（无 restart 策略/资源限制/TLS）
- **Current leaning**: A 起步（compose 分层 dev/prod），k8s P2
- **Blocked by**: 无
- **Resolves when**: 交付计划确认默认值并登记
- **Resolution**: 采纳文档建议默认 **A 起步：单机 compose 生产版**（restart: always、资源 limits、日志 json-file 轮转、reverse proxy + TLS），k8s 编排列 P2；对象存储随部署环境选云 OSS/COS 或自托管 MinIO（D-03 已配置抽象）。影响批次：R10。
- **Reaffirmed（2026-10-21，用户拍板）**：评估过 Railway（按服务拆分部署）后放弃——拆分不省钱且需改编排；**直接在云服务器上用现有 `deploy/docker-compose.prod.yml` 部署**（含 Prometheus/Grafana/Alertmanager）。整体开发完成后再推 GitHub。

## RESOLVED — design-decision-to-evaluate — D-14 LLM 凭据归属与网关
- **Date**: 2026-10-21
- **Source**: 用户需求「LLM key 部署完成后由用户在前端配置」
- **Open item**: key 归谁（部署方 / 每个用户 / 租户管理员）；是否保留 LiteLLM 网关
- **Resolution**: 用户先选「按用户」，随后改为 **租户管理员统一配置、全团队共用**；**去掉 LiteLLM，AI 服务直连厂商**（DeepSeek/GLM/Qwen/Kimi/OpenAI 及自定义 OpenAI 兼容地址）。key 加密存 `tenant_llm_configs`，主服务随拆解请求下发（AI 服务不落盘）；AI 规则/智能协助改经 `POST /ai/complete`。未配置 → 本地规则引擎。已完成，见 production-progress.md §R9-4。

## OPEN — waiting-on-external-condition — D-04 邮件供应商选型
- **Date**: 2026-09-29
- **Source**: production-ddd-design.md §6.1 D-04、§3.2 通知外发；交付计划步骤 s1 明确「留 POC」
- **Open item**: EmailAdapter 实装供应商（Resend / AWS SES / 阿里云 / SMTP 中继）未定
- **Related constraints**: 国内可达性需先做 POC；站内通知兜底线永远可用；阻塞 R5 通知实发批次
- **Current leaning**: 无（POC 前不定）
- **Blocked by**: 国内可达性 POC 结果
- **Resolves when**: POC 完成并记录可达性结论；在此之前 R5 仅实现通道抽象与失败落 delivery.lastError，不锁定供应商

## OPEN — waiting-on-external-condition — D-11 WebPush 首发口径
- **Date**: 2026-09-29
- **Source**: production-ddd-design.md §6.1 D-11；交付计划步骤 s1 明确「留 POC」
- **Open item**: PushAdapter（VAPID）首发做 / POC 后决定 / 不做
- **Related constraints**: VAPID 在国产浏览器可达性未验证（方案 §4.7 风险项）；Push 不可达时邮件/IM/站内必须覆盖
- **Current leaning**: VAPID 可达性 POC 后决定；首发默认倾向「不做 push」
- **Blocked by**: VAPID 国产浏览器可达性 POC
- **Resolves when**: POC 出结论；R5 执行时若仍未决，按「首发不做 push」落地并在此 RESOLVED

## OPEN — design-decision-to-evaluate — R3 可靠性骨架启动时机
- **Date**: 2026-09-29
- **Source**: 交付计划 open_questions；R1/R2 收口后触发
- **Open item**: R3（BullMQ 接线、事件订阅接线、幂等/refresh 换 Redis、Outbox 评估）是否紧接 R1/R2 之后立即启动
- **Related constraints**: R5/R6 可与 R3/R4 并行（不同工作面）；§3.4 验收要求双实例 compose 验证，依赖 R1 迁移地基收口
- **Current leaning**: R1/R2 收口后立即启动 R3
- **Blocked by**: R1/R2 批次完成 + CI 服务容器可用时间确认
- **Resolves when**: R1/R2 交付后团队排期确认，届时在此 RESOLVED

## OPEN — waiting-on-external-condition — CI 服务容器 / staging 基础设施可用时间
- **Date**: 2026-09-29
- **Source**: 交付计划 open_questions；§3.7 CI 门禁
- **Open item**: 集成测试（租户隔离/审计/幂等/apply 原子性）需 testcontainers pg+redis；staging 注入故障验证告警需 staging 环境；二者何时可用未确认
- **Related constraints**: 本批先在本地起容器执行，CI job 先行落地 migration 部分；§4.1 门禁要求集成测试进 CI 且全绿
- **Current leaning**: 本地容器先行，CI 服务容器随 R8 补齐
- **Blocked by**: CI 基础设施（服务容器支持）与 staging 环境建设进度
- **Resolves when**: CI 服务容器跑通首个集成套件、staging 环境可用；届时在此 RESOLVED
