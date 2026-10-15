// swipe-rework-probe.js —— 验证「今日聚焦」页「待我审核」栏右滑动作层是否已扩为 3 个，
// 并确认第 3 个「退回重改」真的可滑出、可点击、能打开「退回重改」口径的抽屉。
//
// 用法（必须与 open/resize/登录/goto 写在同一条 bash 命令里）：
//   node pw.js eval --file swipe-rework-probe.js
//
// ⚠️ 三个必须绕开的坑（前两个来自 skill 步骤 6/7，第三个是本项目实测）：
//  1. SwipeableRow 的动作按钮**始终存在于 DOM**，只是被卡片盖住 ⇒「DOM 里查得到」≠「滑开了」。
//     本探针用 `actionBtn.contains(elementFromPoint(...))` 判定是否真的露出。
//  2. PanResponder **不响应鼠标事件** ⇒ 必须派发合成 TouchEvent。
//  3. 「待我审核」栏里还有 **AI 提议卡片的「驳回」按钮**（同样带 aria-label="驳回"），
//     会污染按文案定位 ⇒ 用「宽度恰为 76」区分：SwipeableRow 动作按钮 = 76，AI 按钮 = 146。
//     另：分组标签是「待我审核」而非「待审核」；数据加载有延迟，必须**轮询等待**而非固定 sleep。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const report = {}

  const firePointer = (el) => {
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
  const roleButtonOf = (el) => {
    let n = el
    while (n) {
      if (n.getAttribute && n.getAttribute('role') === 'button') return n
      n = n.parentElement
    }
    return null
  }

  // ── 1) 切到「待我审核」栏 ──────────────────────────────────────────────
  const tabLeaf = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '待我审核',
  )
  report.tabFound = !!tabLeaf
  if (tabLeaf) firePointer(roleButtonOf(tabLeaf) || tabLeaf)
  report.pathname = location.pathname

  // ── 2) 轮询等待动作行出现（SwipeableRow 动作按钮宽 76 + aria-label 命中）──
  const ACT = ['通过', '驳回', '退回重改', '完成', '承接', '撤回']
  const ACTION_W = 76
  const collect = () =>
    [...document.querySelectorAll('[role="button"]')]
      .map((e) => ({ e, r: e.getBoundingClientRect(), label: (e.getAttribute('aria-label') || '').trim() }))
      .filter((b) => ACT.includes(b.label) && Math.round(b.r.width) === ACTION_W && b.r.height > 0)

  let btns = []
  for (let i = 0; i < 20; i += 1) {
    btns = collect()
    if (btns.length && btns.some((b) => b.label === '退回重改')) break
    await sleep(400)
  }
  if (!btns.length) return JSON.stringify({ ...report, err: 'NO_ACTION_BUTTON' })

  // ── 2.5) 把目标行滚进视口 ──────────────────────────────────────────────
  // 实测：审核卡排在 AI 提议卡之后，第一行 y≈804，已越过 844 视口下沿 ⇒
  // elementFromPoint 会返回 null。必须先把该行滚到视口中部再测。
  const scrollableAncestor = (el) => {
    let n = el.parentElement
    while (n) {
      const cs = getComputedStyle(n)
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 20) return n
      n = n.parentElement
    }
    return null
  }
  const pickVisibleRow = () => {
    btns.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x)
    const y0 = btns[0].r.y
    const group = btns.filter((b) => Math.abs(b.r.y - y0) <= 6)
    return group
  }
  const firstRow = pickVisibleRow()
  const scroller = scrollableAncestor(firstRow[0].e)
  report.scrollerFound = !!scroller
  if (scroller) {
    const target = firstRow[0].r.y - 380
    scroller.scrollTop = Math.max(0, scroller.scrollTop + target)
    await sleep(700)
    btns = collect()
    report.scrollTop = Math.round(scroller.scrollTop)
  }

  // ── 3) 选一行位于视口中部的行 ─────────────────────────────────────────
  btns.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x)
  const visible = btns.filter((b) => b.r.y > 200 && b.r.y < 620)
  const anchor = visible.length ? visible[0] : btns[0]
  const rowY = anchor.r.y
  const row = btns.filter((b) => Math.abs(b.r.y - rowY) <= 6)
  report.rowActionCount = row.length
  report.rowY = Math.round(rowY)
  report.firstRow = row.map((b) => ({
    label: b.label,
    x: Math.round(b.r.x),
    w: Math.round(b.r.width),
    bg: getComputedStyle(b.e).backgroundColor,
  }))

  const rework = row.find((b) => b.label === '退回重改')
  const probeY = row[0].r.y + row[0].r.height / 2
  // 是否真的露出：命中元素是否位于该动作按钮子树内
  const revealed = (b) => {
    const el = document.elementFromPoint(b.r.x + b.r.width / 2, probeY)
    return !!el && b.e.contains(el)
  }
  report.revealedBefore = row.map((b) => ({ label: b.label, revealed: revealed(b) }))

  // ── 4) 合成 TouchEvent 右滑（滑满 maxOffset = 3×76 = 228px）─────────────
  const startEl = document.elementFromPoint(60, probeY)
  if (!startEl) return JSON.stringify({ ...report, err: 'NO_START_EL' })
  const mkTouch = (x) =>
    new Touch({
      identifier: 1, target: startEl,
      clientX: x, clientY: probeY, pageX: x, pageY: probeY, screenX: x, screenY: probeY,
    })
  const fireTouch = (type, x) => {
    const t = mkTouch(x)
    startEl.dispatchEvent(
      new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
        bubbles: true, cancelable: true, composed: true,
      }),
    )
  }
  fireTouch('touchstart', 60)
  for (const x of [80, 105, 135, 170, 205, 240, 270, 295, 310]) fireTouch('touchmove', x)
  fireTouch('touchend', 310)
  await sleep(900)

  report.revealedAfter = row.map((b) => ({ label: b.label, revealed: revealed(b) }))
  report.opened = !!rework && revealed(rework)

  // 可选：滑开即停（供外层截图「三枚动作露出」的证据）
  if (sessionStorage.getItem('stopAfterSwipe') === '1') {
    report.stoppedAfterSwipe = true
    return JSON.stringify(report, null, 1)
  }

  // ── 5) 点指定动作（默认「退回重改」）→ 应打开对应口径抽屉 ────────────────
  // tapAction 用 ASCII 代号（'rework' / 'reject' / 'approve'）而非中文：
  //   · `pw.js eval` 只接受**单个表达式**，用 `;` 分隔多语句会语法失败（静默不生效）；
  //   · 传 ASCII 可完全避开 shell 的中文转义风险。
  const TAP_MAP = { rework: '退回重改', reject: '驳回', approve: '通过' }
  const tapLabel = TAP_MAP[sessionStorage.getItem('tapAction')] || '退回重改'
  const tapTarget = row.find((b) => b.label === tapLabel)
  report.tapLabel = tapLabel
  if (report.opened && tapTarget && revealed(tapTarget)) {
    const el = document.elementFromPoint(tapTarget.r.x + tapTarget.r.width / 2, probeY)
    const btn = el ? roleButtonOf(el) : null
    if (btn) firePointer(btn)
    await sleep(1200)
    const txt = document.body.innerText || ''
    report.drawer = {
      hasConfirmRework: txt.includes('确认退回'),
      hasReworkField: txt.includes('退回重改原因'),
      hasConfirmReject: txt.includes('确认驳回'),
      hasRejectField: txt.includes('驳回原因'),
      tail: txt.replace(/\n+/g, ' / ').slice(-220),
    }
  }

  return JSON.stringify(report, null, 1)
}
