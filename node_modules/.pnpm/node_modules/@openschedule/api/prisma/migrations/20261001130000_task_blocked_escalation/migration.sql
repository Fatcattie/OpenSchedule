-- R3 阻塞>72h 升级（§3.2：tasks.service:642 TODO）：进 blocked 记时间戳 + 升级通知去重标记
-- Expand 变更（新增可空列，旧镜像可启动；应用回滚兼容）
ALTER TABLE "tasks" ADD COLUMN "blocked_at" TIMESTAMPTZ(6);
ALTER TABLE "tasks" ADD COLUMN "block_escalated_at" TIMESTAMPTZ(6);
