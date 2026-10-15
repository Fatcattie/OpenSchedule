// submit-sheet.js —— 在已打开的审核抽屉里点「提交审核」，并在 toast 消失前捕获提示文案。
// 用法：node pw.js eval --file submit-sheet.js
// 前置：先用 click-card-action.js 打开抽屉。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

  const leaf = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === '提交审核',
  )
  if (!leaf) return JSON.stringify({ err: 'NO_SUBMIT_BTN' })

  let n = leaf
  let btn = null
  while (n) {
    if (n.getAttribute && n.getAttribute('role') === 'button') { btn = n; break }
    n = n.parentElement
  }
  const target = btn || leaf
  const ariaDisabled = target.getAttribute('aria-disabled')
  const before = (document.body.innerText || '').match(/待审核\s*(\d+)/)
  fire(target)
  await sleep(900) // 在 TOAST_DURATION(2200ms) 内取样

  const t = document.body.innerText || ''
  const matched = t.match(
    /(已通过|已驳回|已撤回|评审子任务尚未完成，暂不可通过|原因不少于\s*\d+\s*字)/g,
  )
  const after = t.match(/待审核\s*(\d+)/)

  return JSON.stringify({
    ariaDisabled,
    badgeBefore: before ? before[1] : null,
    badgeAfter: after ? after[1] : null,
    matched,
  })
}
