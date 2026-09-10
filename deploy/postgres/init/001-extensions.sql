-- ============================================================
-- OpenSchedule 本地开发库初始化脚本
-- 由 postgres 官方镜像在数据卷【首次】初始化时自动执行
-- （/docker-entrypoint-initdb.d，见 deploy/docker-compose.yml）
-- 数据库本体由 POSTGRES_DB 环境变量创建，这里补充扩展：
-- ============================================================

-- 三元组相似度索引：搜索/模糊匹配（方案 chapter_02 §1：pg_trgm）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gen_random_uuid() 与加密函数（方案：主键 UUIDv7 时间有序）
-- 说明：PostgreSQL 16 无内置 uuidv7，UUIDv7 由应用层（Prisma 侧）生成，
--       pgcrypto 供加密/随机数兜底使用
CREATE EXTENSION IF NOT EXISTS pgcrypto;
