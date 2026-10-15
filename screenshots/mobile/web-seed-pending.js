// web-seed-pending.js —— 把 Web 端 localStorage 里的一个任务置为「待审核」，
// 以便在 demo 数据（待审核 0 条）下仍能走完真实的审核流程。
// 用法：node pw.js eval --file web-seed-pending.js
//   → 之后必须 goto /audit 触发重载，应用才会从 localStorage 重新初始化。
() => {
  const KEY = 'os_ws_v1_tasks'
  const raw = localStorage.getItem(KEY)
  if (!raw) {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i))
    return JSON.stringify({ err: 'NO_TASKS_KEY', keys })
  }
  let tasks
  try {
    tasks = JSON.parse(raw)
  } catch (e) {
    return JSON.stringify({ err: 'BAD_JSON' })
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return JSON.stringify({ err: 'NOT_NONEMPTY_ARRAY', type: typeof tasks })
  }
  const t = tasks[0]
  t.approvalStatus = 'pending'
  if (!t.approvalType) t.approvalType = 'completion'
  if (!Array.isArray(t.auditLogs)) t.auditLogs = []
  localStorage.setItem(KEY, JSON.stringify(tasks))
  // 清空通知，避免上一轮残留导致「已退回重改」断言假阳性
  localStorage.setItem('os_ws_v1_ws_notifications', JSON.stringify([]))
  return JSON.stringify({
    ok: true,
    id: t.id,
    title: t.title,
    approvalStatus: t.approvalStatus,
    approvalType: t.approvalType,
    taskCount: tasks.length,
    notifCleared: true,
  })
}
