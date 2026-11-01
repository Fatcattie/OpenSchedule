/**
 * privilege-escalation.test.ts —— 横向/纵向越权与人员管理回归（R6 / R7-6 / FR-001, FR-002, FR-007, FR-008）
 *
 * 直接驱动已编译产物 services/api/dist/middleware/authz.js：
 * - 纯策略层（canPersonnel / manageableRoles / toPersonnelRole）——逐格断言权限矩阵
 * - NestJS 守卫层（PersonnelAuthzGuard）——用 ExecutionContext + Prisma stub 做对象级越权
 *
 * R7-6 双鉴权收敛：原 CSRF / sha256Hex / timingSafeEqualHex / verifyCsrfHeader 已随 cookie session 一并删除。
 * Bearer token 形态在 OWASP 视角下对 CSRF 免疫，不再需要 CSRF 护栏与对应时序安全助手。
 * 运行：node tests/authz/privilege-escalation.test.ts（Node 22+ 原生 .ts 类型剥离，CJS 语法）。
 * 固化边界：admin 仅管理 member；super_admin 管理 admin 与 member；member 无人员管理权限；
 * 请求体 role/目标 id 均不能扩大调用者范围（对象级授权防 IDOR/BOLA）。
 */
'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');

// pnpm 布局 Node 模块解析引导（同 tenant-isolation.test.ts）
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

const {
  canPersonnel,
  manageableRoles,
  toPersonnelRole,
  PersonnelAuthzGuard,
} = authz;

const ACTIONS = ['list', 'read', 'create', 'update', 'set_status', 'delete', 'assign_role'];
const ROLES = ['super_admin', 'admin', 'member'];

// ── 固定测试数据：角色映射（userRole 视角） ──
// ownerA/ownerB=super_admin(tenant.owner)，adm=admin(tenant.admin)，mem=member(tenant.member)
function makePrisma(db) {
  return {
    user: {
      findUnique: async ({ where }) => db.users[where.id] ?? null,
      count: async ({ where }) => {
        const ids = where.id && where.id.in ? where.id.in : [];
        return ids.filter((id) => db.users[id] && db.users[id].status === 'active').length;
      },
    },
    userRole: {
      // R4 修复：resolveTargetRole 先做跨租户校验（目标在操作者租户存在 user_role，否则 40401）
      findFirst: async ({ where }) => (db.roles[where.userId] ? { id: `ur-${where.userId}` } : null),
      findMany: async ({ where, select }) => {
        // 形态 1：枚举 tenant.owner 分配（countActiveSuperAdmins）
        if (where.role && where.role.key === 'tenant.owner') {
          const ownerUserIds = Object.entries(db.roles)
            .filter(([, key]) => key === 'tenant.owner')
            .map(([id]) => id);
          return (select ? ownerUserIds.map((userId) => ({ userId })) : ownerUserIds.map((userId) => ({ userId, scopeResourceId: null, role: { key: 'tenant.owner', scope: 'tenant' } })));
        }
        // 形态 2：单个用户的角色分配（resolvePersonnelRole）
        const uid = where.userId;
        const key = db.roles[uid];
        if (!key) return [];
        const row = { userId: uid, scopeResourceId: null, role: { key, scope: 'tenant' } };
        return select ? [{ userId: row.userId }] : [row];
      },
    },
  };
}

function authUser(userId, roleKey) {
  return { userId, tenantId: 't1', roles: [{ key: roleKey, scope: 'tenant', scopeResourceId: null, permissions: [] }] }
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

function envelope(error) {
  const body = error.getResponse ? error.getResponse() : {};
  return { code: body.code, status: error.getStatus ? error.getStatus() : null, message: body.message };
}

let passed = 0;
/** 逐格断言计数（矩阵循环，同步断言不经过 ok） */
let matrixCells = 0;
/** 支持同步/异步断言体；全部 await，失败即抛（不被吞）。 */
async function ok(label, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function run() {
  const db = {
    users: {
      ownerA: { id: 'ownerA', status: 'active' },
      ownerB: { id: 'ownerB', status: 'active' },
      adm: { id: 'adm', status: 'active' },
      mem: { id: 'mem', status: 'active' },
    },
    roles: { ownerA: 'tenant.owner', ownerB: 'tenant.owner', adm: 'tenant.admin', mem: 'tenant.member' },
  };
  const prisma = makePrisma(db);

  console.log('§ 权限矩阵逐格断言（纯策略层）');
  for (const action of ACTIONS) {
    for (const target of ['admin', 'member']) {
      // super_admin 对所有管理目标放行
      assert.equal(canPersonnel(action, 'super_admin', target), true, `matrix ${action} super_admin->${target}`);
      matrixCells += 1;
    }
    // admin：除 assign_role 外放行 member，对 admin 一律拒绝（横向越权边界）
    const adminAllowed = action !== 'assign_role';
    assert.equal(canPersonnel(action, 'admin', 'member'), adminAllowed, `matrix ${action} admin->member`);
    matrixCells += 1;
    assert.equal(canPersonnel(action, 'admin', 'admin'), false, `matrix ${action} admin->admin 必须拒绝（横向越权）`);
    matrixCells += 1;
    // member：无任何人员管理动作
    assert.equal(canPersonnel(action, 'member', 'member'), false, `matrix ${action} member->member 必须拒绝`);
    matrixCells += 1;
    assert.equal(canPersonnel(action, 'member', 'admin'), false, `matrix ${action} member->admin 必须拒绝`);
    matrixCells += 1;
  }
  // super_admin 目标：矩阵完全不授予（任何角色都不能管理 super_admin）
  for (const actor of ROLES) {
    for (const action of ACTIONS) {
      assert.equal(canPersonnel(action, actor, 'super_admin'), false, `matrix ${action} ${actor}->super_admin 必须拒绝`);
      matrixCells += 1;
    }
  }

  ok('manageableRoles：super_admin=[admin,member] / admin=[member] / member=[]', () => {
    assert.deepEqual([...manageableRoles('super_admin')], ['admin', 'member']);
    assert.deepEqual([...manageableRoles('admin')], ['member']);
    assert.deepEqual([...manageableRoles('member')], []);
  });

  ok('toPersonnelRole 等级映射（owner 最高，非租户角色不参与）', () => {
    assert.equal(toPersonnelRole([]), 'member');
    assert.equal(toPersonnelRole([{ key: 'tenant.member', scope: 'tenant', scopeResourceId: null }]), 'member');
    assert.equal(toPersonnelRole([{ key: 'tenant.admin', scope: 'tenant', scopeResourceId: null }]), 'admin');
    assert.equal(toPersonnelRole([{ key: 'tenant.owner', scope: 'tenant', scopeResourceId: null }]), 'super_admin');
    // 项目级角色不得提升人员管理权限（纵向越权防护）
    assert.equal(toPersonnelRole([{ key: 'project.owner', scope: 'project', scopeResourceId: 'p1' }]), 'member');
    // 多角色取最高
    assert.equal(
      toPersonnelRole([
        { key: 'tenant.member', scope: 'tenant', scopeResourceId: null },
        { key: 'tenant.owner', scope: 'tenant', scopeResourceId: null },
      ]),
      'super_admin',
    );
  });

  console.log('§ 对象级越权（守卫层，加载目标快照后按矩阵判定）');

  const actorAdmin = authUser('adm', 'tenant.admin');
  const actorSuper = authUser('ownerA', 'tenant.owner');
  const actorMember = authUser('mem', 'tenant.member');

  async function runGuard(actor, action, targetId, extra = {}) {
    const meta = { action, targetParam: 'userId' };
    const req = { user: actor, params: { userId: targetId }, ...extra };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    return guard.canActivate(ctx).then(
      (allowed) => ({ allowed }),
      (error) => ({ allowed: false, error }),
    );
  }

  // 横向越权：admin 不能管理其他 admin
  ok('admin update 目标=adm(其他 admin) → 403/40301', async () => {
    const r = await runGuard(actorAdmin, 'update', 'adm');
    assert.equal(r.allowed, false);
    assert.equal(envelope(r.error).code, 40301);
    assert.equal(envelope(r.error).status, 403);
  });
  ok('admin set_status 目标=adm → 403', async () => {
    const r = await runGuard(actorAdmin, 'set_status', 'adm');
    assert.equal(r.allowed, false);
  });
  ok('admin delete 目标=adm → 403', async () => {
    const r = await runGuard(actorAdmin, 'delete', 'adm');
    assert.equal(r.allowed, false);
  });
  ok('admin assign_role 目标=mem → 403（角色指派仅 super_admin）', async () => {
    const r = await runGuard(actorAdmin, 'assign_role', 'mem');
    assert.equal(r.allowed, false);
  });
  ok('admin update 目标=mem(普通成员) → 放行', async () => {
    const r = await runGuard(actorAdmin, 'update', 'mem');
    assert.equal(r.allowed, true, 'admin 管理 member 应放行');
  });
  ok('admin delete 目标=mem → 放行', async () => {
    const r = await runGuard(actorAdmin, 'delete', 'mem');
    assert.equal(r.allowed, true);
  });

  // 纵向越权：member 不能管理任何人
  ok('member update 目标=mem(自己/同级) → 403', async () => {
    const r = await runGuard(actorMember, 'update', 'mem');
    assert.equal(r.allowed, false);
  });
  ok('member read 目标=adm → 403', async () => {
    const r = await runGuard(actorMember, 'read', 'adm');
    assert.equal(r.allowed, false);
  });

  // super_admin 管理边界
  ok('super_admin update 目标=adm → 放行', async () => {
    const r = await runGuard(actorSuper, 'update', 'adm');
    assert.equal(r.allowed, true);
  });
  ok('super_admin update 目标=ownerB(其他 super_admin) → 403（矩阵不授予 super_admin 目标）', async () => {
    const r = await runGuard(actorSuper, 'update', 'ownerB');
    assert.equal(r.allowed, false, '任何角色都不能管理 super_admin 目标');
  });
  ok('super_admin delete 目标=ownerA(自己) → 403', async () => {
    const r = await runGuard(actorSuper, 'delete', 'ownerA');
    assert.equal(r.allowed, false, '不能删除自己的 super_admin 账号（矩阵层拒绝）');
  });

  console.log('§ 请求体提权（create 角色字段不能扩大调用者范围）');
  async function runCreate(actor, role) {
    const meta = { action: 'create' };
    const req = { user: actor, body: { role } };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    return guard.canActivate(ctx).then((allowed) => ({ allowed }), (error) => ({ allowed: false, error }));
  }
  ok('admin create role=member → 放行', async () => {
    assert.equal((await runCreate(actorAdmin, 'member')).allowed, true);
  });
  ok('admin create role=admin → 403（纵向越权：借 create 提权到 admin）', async () => {
    const r = await runCreate(actorAdmin, 'admin');
    assert.equal(r.allowed, false);
    assert.equal(envelope(r.error).code, 40301);
  });
  ok('admin create 缺 role → 403', async () => {
    const r = await runCreate(actorAdmin, undefined);
    assert.equal(r.allowed, false);
  });
  ok('member create role=member → 403（member 无创建权）', async () => {
    const r = await runCreate(actorMember, 'member');
    assert.equal(r.allowed, false);
  });
  ok('super_admin create role=admin → 放行；role=super_admin → 403', async () => {
    assert.equal((await runCreate(actorSuper, 'admin')).allowed, true);
    const r = await runCreate(actorSuper, 'super_admin');
    assert.equal(r.allowed, false, '不能借 create 造出 super_admin');
  });

  console.log('§ 目标存在性 / 输入边界');
  ok('对象动作目标不存在 → 404/40401（不泄露存在性）', async () => {
    const r = await runGuard(actorSuper, 'read', 'ghost');
    assert.equal(r.allowed, false);
    assert.equal(envelope(r.error).code, 40401);
    assert.equal(envelope(r.error).status, 404);
  });
  ok('目标 id 缺失 → 400/40001', async () => {
    const meta = { action: 'update', targetParam: 'userId' };
    const req = { user: actorSuper, params: {} };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    const r = await guard.canActivate(ctx).then((a) => ({ a }), (e) => ({ e }));
    assert.equal(r.a, undefined);
    assert.equal(envelope(r.e).code, 40001);
  });
  ok('req.user 缺失（未认证） → 401/40101', async () => {
    const meta = { action: 'read' };
    const req = { user: undefined, params: { userId: 'mem' } };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    const r = await guard.canActivate(ctx).then((a) => ({ a }), (e) => ({ e }));
    assert.equal(r.a, undefined);
    assert.equal(envelope(r.e).code, 40101);
  });
  ok('无人员动作元数据（非人员路由） → 守卫放行，不越权拦截', async () => {
    const req = { user: actorMember, params: {} };
    const { guard, ctx } = makeGuard(null, req, prisma);
    assert.equal(await guard.canActivate(ctx), true);
  });

  console.log('§ 集合动作 list（仅看操作者角色）');
  async function runList(actor) {
    const meta = { action: 'list' };
    const req = { user: actor, params: {} };
    const { guard, ctx } = makeGuard(meta, req, prisma);
    return guard.canActivate(ctx).then((a) => ({ allowed: a }), (e) => ({ allowed: false, error: e }));
  }
  ok('list：admin 放行 / member 403 / super_admin 放行', async () => {
    assert.equal((await runList(actorAdmin)).allowed, true);
    const m = await runList(actorMember);
    assert.equal(m.allowed, false);
    assert.equal(envelope(m.error).code, 40301);
    assert.equal((await runList(actorSuper)).allowed, true);
  });

  // R7-6：CSRF 与时序安全助手（sha256Hex/timingSafeEqualHex/verifyCsrfHeader）已随 cookie session 一并删除；
  // Bearer token 由 OWASP 视为 CSRF 免疫形态，不再需 CSRF 防护层。

  console.log(`\nprivilege-escalation: ${passed} assertion groups + ${matrixCells} matrix cells all passed`);
}

run().catch((error) => {
  console.error('privilege-escalation FAILED:', error);
  process.exitCode = 1;
});
