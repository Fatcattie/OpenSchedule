// web-audit-rework.js —— 在 Web 端走完一次「驳回 + 审核意见=退回重改」的真实审核流程，
// 然后从 localStorage 的通知中心数据里断言提报人收到的通知文案。
//
// 用法（必须与 open/resize/web-login/goto 写在同一条 bash 命令里）：
//   node pw.js eval --file web-seed-pending.js
//   node pw.js goto http://127.0.0.1:4186/audit
//   node pw.js eval --file web-audit-rework.js
//
// ⚠️ AntD 会在两个中文字之间插空格（按钮渲染成「登 录」「提 交 审 核」）⇒ 定位一律去空白后比较。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = {}
  const norm = (s) => (s || '').replace(/\s+/g, '')

  const fire = (el) => {
    const b = el.getBoundingClientRect()
    const o = {
      bubbles: true, cancelable: true, composed: true,
      clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    }
    el.dispatchEvent(new PointerEvent('pointerdown', o))
    el.dispatchEvent(new MouseEvent('mousedown', o))
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  }

  /** 在 root 内按「去空白全等」找叶子，点它最近的可点祖先 */
  const clickByText = (text, root) => {
    const scope = root || document
    const want = norm(text)
    const leaf = [...scope.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && norm(e.textContent) === want,
    )
    if (!leaf) return false
    fire(leaf.closest('button') || leaf.closest('label') || leaf)
    return true
  }

  const setTextarea = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // ── 1) 打开待审核卡片的「审核」抽屉 ────────────────────────────────────
  const auditBtns = [...document.querySelectorAll('button')].filter((b) => norm(b.textContent) === '审核')
  out.auditBtnCount = auditBtns.length
  if (!auditBtns.length) {
    return JSON.stringify({ ...out, err: 'NO_AUDIT_BUTTON', tail: (document.body.innerText || '').replace(/\n+/g, ' / ').slice(0, 400) })
  }
  fire(auditBtns[0])
  await sleep(1200)

  const modal = document.querySelector('.ant-modal-content')
  out.modalOpen = !!modal
  if (!modal) return JSON.stringify({ ...out, err: 'NO_MODAL' })

  // ── 2) 审核动作 = 驳回 ────────────────────────────────────────────────
  out.clickReject = clickByText('驳回', modal)
  await sleep(400)

  // ── 3) 审核意见 = 退回重改 ────────────────────────────────────────────
  // ⚠️ 关键：Web 的「审核意见」是 AntD **Select**（不是 Radio）——
  //    选项渲染在下拉 portal（`.ant-select-dropdown`，挂在 body 下）里，
  //    **未展开时 DOM 中根本不存在**，所以按文本直接搜必然失败。
  const selector = modal.querySelector('.ant-select-selector') || modal.querySelector('.ant-select')
  out.hasSelect = !!selector
  // 意见选项用 ASCII 代号传参（'rework' / 'reject'），避开 shell 中文转义；
  // 注意 pw.js eval 只接受单个表达式，故 setItem 必须单独一次调用。
  const OPINION_MAP = { rework: '退回重改', reject: '不通过', agree: '同意', other: '其他' }
  const wantOpinion = OPINION_MAP[sessionStorage.getItem('webOpinion')] || '退回重改'
  out.wantOpinion = wantOpinion
  if (selector) {
    fire(selector)
    await sleep(800)
    const opts = [...document.querySelectorAll('.ant-select-item-option')]
    out.optionLabels = opts.map((o) => norm(o.textContent))
    const target = opts.find((o) => norm(o.textContent) === wantOpinion)
    out.clickOpinion = !!target
    if (target) {
      fire(target)
      await sleep(600)
    }
  } else {
    out.clickOpinion = false
  }

  // ── 4) 原因（驳回时必填）──────────────────────────────────────────────
  const ta = modal.querySelector('textarea')
  out.hasTextarea = !!ta
  if (ta) setTextarea(ta, '请补充验收截图后重新提交')
  await sleep(300)

  out.formSnapshot = [...modal.querySelectorAll('.ant-form-item-label label')].map((l) => norm(l.textContent))

  // ── 5) 提交 ───────────────────────────────────────────────────────────
  out.clickSubmit = clickByText('提交审核', modal)
  await sleep(2500)

  // ── 6) 从通知中心数据断言提报人收到的文案 ─────────────────────────────
  const raw = localStorage.getItem('os_ws_v1_ws_notifications')
  let list = []
  try {
    list = JSON.parse(raw || '[]')
  } catch (e) {
    list = []
  }
  const approval = list.filter((n) => n.eventType === 'approval_result')
  out.notifTotal = list.length
  out.approvalNotifs = approval.map((n) => ({ title: n.title, body: n.body }))
  out.hasReworkCopy = approval.some((n) => norm(n.title || '').includes('已退回重改'))
  out.hasRejectCopy = approval.some((n) => norm(n.title || '').includes('被驳回'))

  // 任务侧核对：approvalStatus 应变 rejected，且 auditLogs 末尾 opinion 应为 rework
  const tRaw = localStorage.getItem('os_ws_v1_tasks')
  try {
    const tasks = JSON.parse(tRaw || '[]')
    const target = tasks.find((t) => t.approvalStatus === 'rejected')
    out.rejectedTask = target
      ? {
          id: target.id,
          approvalStatus: target.approvalStatus,
          lastOpinion: target.auditLogs?.[target.auditLogs.length - 1]?.opinion,
          lastAction: target.auditLogs?.[target.auditLogs.length - 1]?.action,
        }
      : null
  } catch (e) {
    out.rejectedTask = 'PARSE_ERR'
  }

  return JSON.stringify(out, null, 1)
}
