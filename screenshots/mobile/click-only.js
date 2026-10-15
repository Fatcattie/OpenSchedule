// click-only.js —— 仅点击卡片内的「审核通过」并短等，便于外部立即截图捕获 toast
// 用法：node pw.js eval --file click-only.js
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const cands = [...document.querySelectorAll('*')].filter((e) => {
    if (e.children.length !== 0) return false
    if (e.textContent.trim() !== '审核通过') return false
    const b = e.getBoundingClientRect()
    return b.width > 0 && b.y > 140
  })
  if (!cands.length) return 'NOT_FOUND'
  let n = cands[0]
  let btn = null
  while (n) {
    if (n.getAttribute && n.getAttribute('role') === 'button') { btn = n; break }
    n = n.parentElement
  }
  const target = btn || cands[0]
  const bb = target.getBoundingClientRect()
  const o = { bubbles: true, cancelable: true, composed: true, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 }
  target.dispatchEvent(new PointerEvent('pointerdown', o))
  target.dispatchEvent(new MouseEvent('mousedown', o))
  target.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
  target.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  await sleep(350)
  return 'clicked@' + Math.round(bb.y)
}
