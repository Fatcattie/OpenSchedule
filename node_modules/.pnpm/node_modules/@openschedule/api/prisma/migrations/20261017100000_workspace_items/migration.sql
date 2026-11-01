-- D-07 一期：协作工作台文档存储（原前端 localStorage 体系落库，按集合 + 条目、JSONB + 乐观锁）
-- CreateTable
CREATE TABLE "workspace_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "collection" VARCHAR(40) NOT NULL,
    "owner_key" VARCHAR(36) NOT NULL DEFAULT '',
    "item_key" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_items_tenant_id_collection_owner_key_item_key_key" ON "workspace_items"("tenant_id", "collection", "owner_key", "item_key");

-- AddForeignKey
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
