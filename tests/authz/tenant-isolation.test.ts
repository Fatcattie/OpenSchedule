/**
 * tenant-isolation.test.ts —— 人员管理跨租户 IDOR 回归（R4 / §3.3 验收「authz 回归测试扩 5 例（租户隔离）」）
 *
 * 背景：middleware/authz.ts 的 PersonnelAuthzGuard 解析目标角色前，必须先校验目标属于操作者租户，
 * 否则系统级 User（无 tenant 谓词）会让跨租户用户被解析成 member，造成 admin(A) 可写仅属于 tenant B 的用户。
 *
 * 直接驱动已编译产物 services/api/dist/middleware/authz.js 的 PersonnelAuthzGuard（与 privilege-escalation.test.ts 同源）：
 *   1. admin(A) update 目标=仅 tenant B 成员 → 40401（跨租户不可见）
 *   2. super_admin(A) read 跨租户用户 → 40401
 *   3. 目标在 A 无 user_role 但系统级 user.findUnique 命中 → 仍 40401
 *   4. 同租户 admin→member 正向对照 → 放行
 *   5. 同租户 member 自身操作 → 拒绝（不被租户判定误伤）
 * 运行：node tests/authz/tenant-isolation.test.ts（Node 22+ 原生 .ts 类型剥离，CJS 语法；需先 pnpm build 产出 dist）。
 */
'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');

// pnpm 布局 Node 模块解析引导（同 privilege-escalation.test.ts）
const Module = require('node:module');
const apiRoot = path.join(__dirname, '..', '..', 'services', 'api');
process.env.NODE_PATH = [
  path.join(apiRoot, 'node_modules'),
  path.join(apiRoot, 'node_modules', '.pnpm'),
].join(path.delimiter);
Module._initPaths();

const dist = path.join(apiRoot, 'dist');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const authz = require(path.join(dist, 'middleware', 'authz.js'));

const { PersonnelAuthzGuard } = authz;

function authUser(userId, tenantId, roleKey) {
  return {
    userId,
    tenantId,
    roles: roleKey ? [{ key: roleKey, scope: 'tenant', scopeResourceId: null, permissions: [] }] : [],
  };
}

function envelope(error) {
  const body = error.getResponse ? error.getResponse() : {};
  return { code: body.code, status: error.getStatus ? error.getStatus() : null, message: body.message };
}

/**
 * Prisma stub：用户与用户-角色归属。
 * - users: { [tenantA]: {userId, roleKey?}, ... }
 * - userRole 归属：tenantOf[user] = { tenantId, roleKey }
 * 仅当目标在 tenantOf 中登记于操作者租户时 findFirst(userRole) 命中（R4 修复后的隔离判定依据）。
 */
function makePrisma(db) {
  return {
    user: {
      findUnique: async ({ where }) => (db.users[where.id] ? { id: db.users[where.id].id } : null),
    },
    userRole: {
      findFirst: async ({ where }) => {
        const rec = db.userRoles[where.userId];
        // R4：resolveTargetRole 新增的跨租户校验 = 目标在操作者租户存在 user_role
        if (rec && rec.tenantId === where.tenantId) return { id: 'ur' };
        return null;
      },
      findMany: async ({ where }) => {
        // resolvePersonnelRole（仅对通过租户校验的目标调用）
        const rec = db.userRoles[where.userId];
        if (!rec || rec.tenantId !== where.tenantId) return [];
        return [{ userId: where.userId, scopeResourceId: null, role: { key: rec.roleKey, scope: 'tenant' } }];
      },
    },
  };
}

function makeGuard(meta, req, prisma) {
  const reflector = { getAllAndOverride: () => meta };
  const ctx = {
    getHandler: () => ({}),
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { guard: new PersonnelAuthzGuard(reflector, prisma), ctx };
}

async function run() {
  const db = {
    users: {
      adm: { id: 'adm' },
      mem: { id: 'mem' },
      buser: { id: 'buser' },
      ghost: { id: 'ghost' },
    },
    userRoles: {
      adm: { tenantId: 'tenantA', roleKey: 'tenant.admin' },
      mem: { tenantId: 'tenantA', roleKey: 'tenant.member' },
      buser: { tenantId: 'tenantB', roleKey: 'tenant.member' },
      // ghost 在 tenantA 没有任何 user_role（系统级 User 表命中但租户归属缺失）
    },
  };
  const prisma = makePrisma(db);

  const adminA = authUser('adm', 'tenantA', 'tenant.admin');
  const superA = authUser('oA', 'tenantA', 'tenant.owner');
  const memberA = authUser('mem', 'tenantA', 'tenant.member');

  async function runGuard(actor, action, targetId) {
    const meta = { action, targetParam: 'userId' };
    const req = { user: actor, params: { userId: targetId } };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    return guard.canActivate(ctx).then(
      (allowed) => ({ allowed }),
      (error) => ({ allowed: false, error }),
    );
  }

  // 1. 跨租户：admin(A) 管理仅属于 tenant B 的用户 → 40401（不泄露存在性）
  const r1 = await runGuard(adminA, 'update', 'buser');
  assert.equal(r1.allowed, false, '跨租户目标必须拒绝');
  assert.equal(envelope(r1.error).code, 40401, '跨租户应 40401');
  assert.equal(envelope(r1.error).status, 404);

  // 2. 跨租户 read 也拒绝（super_admin 不豁免租户隔离）
  const r2 = await runGuard(superA, 'read', 'buser');
  assert.equal(r2.allowed, false, 'super_admin 跨租户 read 也必须拒绝');
  assert.equal(envelope(r2.error).code, 40401);

  // 3. 系统级 User 命中但目标在操作者租户无 user_role → 仍 40401
  const r3 = await runGuard(adminA, 'update', 'ghost');
  assert.equal(r3.allowed, false, '租户内无角色归属的目标必须拒绝');
  assert.equal(envelope(r3.error).code, 40401);

  // 4. 正向对照：同租户 admin→member 放行
  const r4 = await runGuard(adminA, 'update', 'mem');
  assert.equal(r4.allowed, true, '同租户 admin 管理 member 应放行（租户判定不误伤）');

  // 5. 同租户 member 自身：矩阵拒绝（不被租户判定误伤）
  const r5 = await runGuard(memberA, 'update', 'mem');
  assert.equal(r5.allowed, false);
  assert.equal(envelope(r5.error).code, 40301, '同租户矩阵判定不受影响（member→member 40301）');

  console.log('tenant-isolation: 5 cross-tenant assertions passed');
}

run().catch((error) => {
  console.error('tenant-isolation FAILED:', error);
  process.exitCode = 1;
});