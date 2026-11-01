/**
 * @openschedule/workspace-rules（D-07 二期）纯规则测试：任务写入守卫 + 审核命令。
 * 包本身无测试运行器，随 services/api 的 vitest 运行（test 目录下的 .spec.ts）。
 */
import { describe, expect, it } from 'vitest';
import {
  ReviewRuleError,
  applyTaskReview,
  checkTaskDelete,
  checkTaskUpsert,
  toIsoFromLocal,
  type RuleActor,
  type RuleTask,
  type TaskWriteContext,
} from '@openschedule/workspace-rules';

const member: RuleActor = { userId: 'm', displayName: '成员', isManager: false };
const manager: RuleActor = { userId: 'boss', displayName: '经理', isManager: true };
const ctx = (actor: RuleActor, groups?: Map<string, string>): TaskWriteContext => ({ actor, recurrenceGroupCreators: groups });
const t = (over: Partial<RuleTask> = {}): RuleTask => ({
  id: 'x',
  kind: 'task',
  title: 'T',
  status: 'todo',
  createdBy: 'm',
  assigneeId: null,
  approvalStatus: 'none',
  approvalType: null,
  auditLogs: [],
  executionLogs: [],
  comments: [],
  ...over,
});
let seq = 0;
const env = (actor: RuleActor) => ({ actor, now: '2026-10-18T00:00:00.000Z', newId: (p: string) => `${p}-${++seq}` });

describe('checkTaskUpsert', () => {
  it('成员：领取空任务、退回自己的任务放行；指派他人拦截，但提交待审时放行', () => {
    expect(checkTaskUpsert('x', t(), t({ assigneeId: 'm' }), ctx(member))).toBeNull();
    expect(checkTaskUpsert('x', t({ assigneeId: 'm' }), t({ assigneeId: null }), ctx(member))).toBeNull();
    expect(checkTaskUpsert('x', t(), t({ assigneeId: 'other' }), ctx(member))).toMatch('领取');
    expect(checkTaskUpsert('x', t(), t({ assigneeId: 'other', approvalStatus: 'pending', approvalType: 'proposal' }), ctx(member))).toBeNull();
  });

  it('成员：普通任务不能直接完成，评审任务 / 个人计划可以', () => {
    expect(checkTaskUpsert('x', t(), t({ status: 'done' }), ctx(member))).toMatch('提报完成');
    expect(checkTaskUpsert('x', t({ kind: 'review' }), t({ kind: 'review', status: 'done' }), ctx(member))).toBeNull();
    expect(checkTaskUpsert('x', t({ kind: 'plan' }), t({ kind: 'plan', status: 'done' }), ctx(member))).toBeNull();
  });

  it('成员：不能把提报写成通过；管理可直接指派（非待审 → approved）', () => {
    expect(checkTaskUpsert('x', t(), t({ proposalStatus: 'approved' }), ctx(member))).toMatch('提报');
    expect(checkTaskUpsert('x', t(), t({ assigneeId: 'm', approvalStatus: 'approved' }), ctx(manager))).toBeNull();
  });

  it('任何人都不能经批量写结束待审', () => {
    const pending = t({ approvalStatus: 'pending', approvalType: 'content' });
    expect(checkTaskUpsert('x', pending, t({ approvalStatus: 'approved' }), ctx(manager))).toMatch('审核操作');
    expect(checkTaskUpsert('x', pending, t({ approvalStatus: 'pending', approvalType: 'content', title: '改' }), ctx(manager))).toBeNull();
  });

  it('执行记录 / 评论只能追加，且作者必须是本人', () => {
    const log = { id: 'l1', authorId: 'm', content: 'a' };
    expect(checkTaskUpsert('x', t(), t({ executionLogs: [log] }), ctx(member))).toBeNull();
    expect(checkTaskUpsert('x', t(), t({ comments: [{ ...log, authorId: 'other' }] }), ctx(member))).toMatch('作者');
    expect(checkTaskUpsert('x', t({ executionLogs: [log] }), t({ executionLogs: [{ ...log, content: 'b' }] }), ctx(manager))).toMatch('不能修改');
    expect(checkTaskUpsert('x', t({ executionLogs: [log] }), t({ executionLogs: [] }), ctx(manager))).toMatch('不能删除');
  });

  it('重复任务后续实例：沿用同组创建人可由他人客户端生成', () => {
    const groups = new Map([['g1', 'creator']]);
    const sibling = t({ id: 'x', createdBy: 'creator', assigneeId: 'someone', recurrenceGroupId: 'g1' });
    expect(checkTaskUpsert('x', null, sibling, ctx(member, groups))).toBeNull();
    expect(checkTaskUpsert('x', null, { ...sibling, createdBy: 'forged' }, ctx(member, groups))).toMatch('创建人');
  });

  it('键与 id 不一致、顺序表格式非法 → 拒绝', () => {
    expect(checkTaskUpsert('y', null, t(), ctx(manager))).toMatch('不一致');
    expect(checkTaskUpsert('__order__', null, [1, 2], ctx(manager))).toMatch('顺序表');
    expect(checkTaskUpsert('__order__', null, ['a'], ctx(member))).toBeNull();
  });
});

describe('checkTaskDelete', () => {
  it('成员只能删自己的草稿 / 个人计划 / 待审新提报；管理不限；审核中的删除申请只能走审核', () => {
    expect(checkTaskDelete('x', t({ isDraft: true }), ctx(member))).toBeNull();
    expect(checkTaskDelete('x', t({ kind: 'plan' }), ctx(member))).toBeNull();
    expect(checkTaskDelete('x', t({ approvalStatus: 'pending', approvalType: 'proposal' }), ctx(member))).toBeNull();
    expect(checkTaskDelete('x', t(), ctx(member))).toMatch('删除申请');
    expect(checkTaskDelete('x', t({ createdBy: 'other', isDraft: true }), ctx(member))).toMatch('删除申请');
    expect(checkTaskDelete('x', t(), ctx(manager))).toBeNull();
    expect(checkTaskDelete('x', t({ approvalStatus: 'pending', pendingDelete: true }), ctx(manager))).toMatch('审核');
  });
});

describe('applyTaskReview', () => {
  it('内容变更通过 → 覆盖标题描述；驳回 → 清空待审内容', () => {
    const task = t({ approvalStatus: 'pending', approvalType: 'content', pendingContent: { title: '新', description: 'D' } });
    const ok = applyTaskReview([task], { taskId: 'x', action: 'approve', opinion: 'agree' }, env(manager));
    expect(ok.upserts[0]).toMatchObject({ title: '新', description: 'D', pendingContent: null, approvalStatus: 'approved', approvalType: null });
    const no = applyTaskReview([task], { taskId: 'x', action: 'reject', opinion: 'rework' }, env(manager));
    expect(no.upserts[0]).toMatchObject({ title: 'T', pendingContent: null, approvalStatus: 'rejected' });
    expect(no.upserts[0].auditLogs?.[0]).toMatchObject({ action: 'reject', opinion: 'rework', operatorId: 'boss' });
  });

  it('承接人审核通过 → 推荐人生效；调整时间通过 → 起止时间生效', () => {
    const assign = applyTaskReview([t({ approvalStatus: 'pending', approvalType: 'assign', recommendedAssigneeId: 'r' })], { taskId: 'x', action: 'approve', opinion: 'agree' }, env(manager));
    expect(assign.upserts[0]).toMatchObject({ assigneeId: 'r', recommendedAssigneeId: null });
    const re = applyTaskReview(
      [t({ approvalStatus: 'pending', approvalType: 'reschedule', pendingContent: { title: 'T', description: '', startAt: 's', endAt: 'e' } })],
      { taskId: 'x', action: 'approve', opinion: 'agree' },
      env(manager),
    );
    expect(re.upserts[0]).toMatchObject({ startAt: 's', endAt: 'e', pendingContent: null });
  });

  it('项目提报通过 → 按 SOP 顶层步骤生成项目内任务并置顶；驳回 → 提报状态 rejected', () => {
    const project = t({
      kind: 'project',
      approvalStatus: 'pending',
      approvalType: 'proposal',
      proposalStatus: 'pending',
      tags: ['团队协作项目', '互联网'],
      sop: { steps: [{ id: 'a', title: 'A', children: [] }, { id: 'b', title: 'B', children: [{ id: 'b1', title: 'B1', children: [] }] }], source: 'manual', updatedAt: '' },
    });
    const ok = applyTaskReview([project], { taskId: 'x', action: 'approve', opinion: 'agree' }, env(manager));
    expect(ok.prepend).toHaveLength(2);
    expect(ok.upserts.slice(1).map((g) => [g.title, g.projectId, g.createdBy, g.tags])).toEqual([
      ['A', 'x', 'm', ['项目任务', '互联网']],
      ['B', 'x', 'm', ['项目任务', '互联网']],
    ]);
    expect(ok.upserts[2].sop?.steps.map((s) => s.title)).toEqual(['B1']);
    expect(ok.upserts[0]).toMatchObject({ proposalStatus: 'approved', status: 'todo' });
    const no = applyTaskReview([project], { taskId: 'x', action: 'reject', opinion: 'reject' }, env(manager));
    expect(no.upserts[0].proposalStatus).toBe('rejected');
  });

  it('需评审的完成提报：评审未通过不能审批', () => {
    const task = t({ approvalStatus: 'pending', approvalType: 'completion', needReview: true, reviewStatus: 'pending' });
    expect(() => applyTaskReview([task], { taskId: 'x', action: 'approve', opinion: 'agree' }, env(manager))).toThrow(ReviewRuleError);
  });

  it('删除申请驳回 → 恢复任务；「其他」意见须填原因', () => {
    const task = t({ approvalStatus: 'pending', pendingDelete: true });
    const res = applyTaskReview([task], { taskId: 'x', action: 'reject', opinion: 'agree' }, env(manager));
    expect(res.upserts[0]).toMatchObject({ pendingDelete: false, approvalStatus: 'none' });
    expect(() => applyTaskReview([task], { taskId: 'x', action: 'reject', opinion: 'other', reason: ' ' }, env(manager))).toThrow('原因');
  });
});

describe('toIsoFromLocal', () => {
  it('本地 YYYY-MM-DD HH:mm 按 UTC+8 解析；ISO 原样；非法回退', () => {
    expect(toIsoFromLocal('2026-10-18 08:30', 'f')).toBe('2026-10-18T00:30:00.000Z');
    expect(toIsoFromLocal('2026-10-18T00:30:00.000Z', 'f')).toBe('2026-10-18T00:30:00.000Z');
    expect(toIsoFromLocal('garbage', 'f')).toBe('f');
  });
});
