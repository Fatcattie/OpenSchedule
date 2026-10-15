// nav-audit-redaction.js —— 登录后导航到审核中心，并在真实 DOM 中核验新增红字文案
// 用法：node pw.js eval --file nav-audit-redaction.js
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const findButton = (sub, exact = false) => {
    const cands = [...document.querySelectorAll('*')].filter((e) => {
      const t = e.textContent.trim()
      if (exact ? t !== sub : !t.includes(sub)) return false
      if (e.children.length !== 0) return false
      const b = e.getBoundingClientRect()
      if (b.width <= 0 || b.height <= 0) return false
      let n = e
      while (n) {
        if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) return true
        n = n.parentElement
      }
      return false
    })
    return cands[0] ?? null
  }

  const clickButton = (sub, exact = false) => {
    const leaf = findButton(sub, exact)
    if (!leaf) return false
    let n = leaf
    let btn = null
    while (n) {
      if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) {
        btn = n
        break
      }
      n = n.parentElement
    }
    const el = btn || leaf
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
    return true
  }

  const log = []
  log.push('start=' + location.pathname)

  log.push('clickMe=' + clickButton('我的', true))
  await sleep(1600)
  log.push('afterMe=' + location.pathname)

  log.push('clickAudit=' + clickButton('审核中心', false))
  await sleep(2200)
  log.push('afterAudit=' + location.pathname)

  const txt = document.body.innerText || ''
  log.push('hasTuihui=' + txt.includes('退回 不通过'))
  log.push('hasShenheTongguo=' + txt.includes('审核通过'))
  log.push('textLen=' + txt.length)

  // 找出红字节点，记录其颜色（用于确认 colors.danger 生效）
  const reds = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && ['退回 不通过', '审核通过'].includes(e.textContent.trim()))
    .map((e) => {
      const cs = getComputedStyle(e)
      return e.textContent.trim() + '@' + cs.color
    })
  log.push('redNodes=' + JSON.stringify(reds.slice(0, 6)))

  return log.join(' | ')
}
