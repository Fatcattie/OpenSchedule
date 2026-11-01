-- R6-1 首次登录强制改密（§3.2 成员 onboarding / D-05 B：管理员代建账号 → 用户首次登录改密）
-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;