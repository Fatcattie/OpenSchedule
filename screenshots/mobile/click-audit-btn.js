// click-audit-btn.js —— 用 aria-label 精确点击审核按钮，并报告点击后的页面变化
// 依赖 sessionStorage.auditLabel 指定要点的按钮 aria-label
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const want = sessionStorage.getItem('auditLabel') || '审核通过'
  const out = { want, before: null, after: null, hitSelf: null }

  const el = [...document.querySelectorAll('[role="button"]')].find(
    (e) => e.getAttribute('aria-label') === want,
  )
  if (!el) return JSON.stringify({ ...out, error: 'button not found' })

  const r = el.getBoundingClientRect()
  out.before = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }

  // 命中测试：该坐标上最顶层元素是否在按钮子树内
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  out.hitSelf = !!(top && el.contains(top))

  const fire = (target) => {
    const b = target.getBoundingClientRect()
    const o = {
      bubbles: true, cancelable: true, composed: true,
      clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    }
    target.dispatchEvent(new PointerEvent('pointerdown', o))
    target.dispatchEvent(new MouseEvent('mousedown', o))
    target.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
    target.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
    target.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  }
  fire(el)
  await sleep(1500)

  out.afterPath = location.pathname
  out.afterText = (document.body.innerText || '').replace(/\n+/g, ' / ').slice(-500)
  return JSON.stringify(out, null, 1)
}
