// click-inline-audit.js —— 严格验证「今日聚焦」内联三枚审批按钮：
//   1) 先 scrollIntoView 再测命中（排除「在视口外导致 elementFromPoint 返回 null」的假阴性）
//   2) 报告命中链（最顶层元素 tag/class/文本）证明按钮未被遮挡
//   3) 点击后报告抽屉标题 / 正文 / 主按钮，判断落在哪个分支
// 依赖 sessionStorage.auditLabel 指定 aria-label。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const want = sessionStorage.getItem('auditLabel') || '审核通过'
  const out = { want, found: false }

  const el = [...document.querySelectorAll('[role="button"]')].find(
    (e) => e.getAttribute('aria-label') === want,
  )
  if (!el) return JSON.stringify({ ...out, error: 'button not found' })

  // 1) 滚入视口后再测量
  el.scrollIntoView({ block: 'center' })
  await sleep(600)
  const r = el.getBoundingClientRect()
  out.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  out.inViewport = r.y >= 0 && r.y + r.height <= window.innerHeight

  // 2) 命中测试 + 命中链
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const top = document.elementFromPoint(cx, cy)
  out.hitSelf = !!(top && el.contains(top))
  if (top) {
    out.topChain = []
    let n = top
    for (let i = 0; i < 4 && n; i++) {
      out.topChain.push(`${n.tagName}${n.getAttribute && n.getAttribute('role') ? '[role=' + n.getAttribute('role') + ']' : ''}:${(n.textContent || '').trim().slice(0, 12)}`)
      n = n.parentElement
    }
  } else {
    out.topChain = ['(null — 坐标不在视口内)']
  }

  // 3) 记录点击前文案基线
  const beforeText = (document.body.innerText || '')

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
  await sleep(1600)

  const afterText = (document.body.innerText || '')
  // 抽屉新增文案 = 点击后比点击前多出来的尾部内容
  out.drawerDelta = afterText.replace(beforeText, '').replace(/\n+/g, ' / ').slice(0, 300)
  out.afterPath = location.pathname
  // 抽屉里出现的按钮文本（确认/提交/驳回 等）
  out.dialogButtons = [...document.querySelectorAll('[role="button"]')]
    .map((e) => (e.textContent || '').trim())
    .filter((t) => /确认|提交|驳回|通过|退回/.test(t))
    .slice(0, 8)

  return JSON.stringify(out, null, 1)
}
