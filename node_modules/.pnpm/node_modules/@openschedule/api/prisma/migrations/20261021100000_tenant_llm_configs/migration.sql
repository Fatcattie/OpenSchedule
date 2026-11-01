-- 租户 AI 模型配置（管理员在「设置 → AI 模型」维护，全团队共用；api_key 为 AES-256-GCM 密文）
-- CreateTable
CREATE TABLE "tenant_llm_configs" (
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "base_url" VARCHAR(500) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_key_key_version" INTEGER NOT NULL DEFAULT 1,
    "api_key_last4" VARCHAR(8) NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_llm_configs_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_llm_configs" ADD CONSTRAINT "tenant_llm_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
