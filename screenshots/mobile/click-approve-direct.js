// click-approve-direct.js —— 精确点击「卡片内」的红色「审核通过」（按 y 坐标排除四栏 Tab），
// 并在 toast 消失前捕获提示文案
// 用法：node pw.js eval --file click-approve-direct.js
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 先确保回到「待审核」栏（Tab 叶子文本全等）
  const tabLeaf = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '待审核',
  )
  if (tabLeaf) {
    let n = tabLeaf
    let btn = null
    while (n) {
      if (n.getAttribute && n.getAttribute('role') === 'button') { btn = n; break }
      n = n.parentElement
    }
    const el = btn || tabLeaf
    const b = el.getBoundingClientRect()
    const o = { bubbles: true, cancelable: true, composed: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }
    el.dispatchEvent(new PointerEvent('pointerdown', o))
    el.dispatchEvent(new MouseEvent('mousedown', o))
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  }
  await sleep(1500)

  const before = (document.body.innerText || '').match(/待审核\s*(\d+)/)

  // 卡片红字：y 明显大于 Tab 区（Tab 约 y=90）
  const cands = [...document.querySelectorAll('*')].filter((e) => {
    if (e.children.length !== 0) return false
    if (e.textContent.trim() !== '审核通过') return false
    const b = e.getBoundingClientRect()
    return b.width > 0 && b.y > 140
  })
  if (!cands.length) return JSON.stringify({ err: 'NOT_FOUND' })

  const el0 = cands[0]
  let n = el0
  let btn = null
  while (n) {
    if (n.getAttribute && n.getAttribute('role') === 'button') { btn = n; break }
    n = n.parentElement
  }
  const target = btn || el0
  const bb = target.getBoundingClientRect()
  const o = { bubbles: true, cancelable: true, composed: true, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }
  target.dispatchEvent(new PointerEvent('pointerdown', o))
  target.dispatchEvent(new MouseEvent('mousedown', o))
  target.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))

  await sleep(900) // 在 TOAST_DURATION(2200ms) 内取样
  const t = document.body.innerText || ''
  const matched = t.match(/(已通过|已驳回|已撤回|评审子任务尚未完成，暂不可通过|原因不少于\s*\d+\s*字)/g)
  const after = t.match(/待审核\s*(\d+)/)

  return JSON.stringify({
    clickedY: Math.round(bb.y),
    badgeBefore: before ? before[1] : null,
    badgeAfter: after ? after[1] : null,
    matched,
    tail: t.replace(/\n+/g, ' / ').slice(-140),
  })
}
