// click-card-action.js —— 点击「卡片内」指定动作按钮（按 y 坐标排除四栏 Tab），
// 并回报抽屉打开后的预置动作 / 意见。
//
// 用法（同一条 bash 命令内，先注入目标再执行本文件）：
//   node pw.js eval "sessionStorage.setItem('cardAction','退回重改')"
//   node pw.js eval --file click-card-action.js
//
// 说明：不用环境变量 / location.hash —— 前者在页面上下文不存在，
// 后者有被 React Navigation linking 解析的风险。sessionStorage 同标签页跨 reload 存活，最稳。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const want = sessionStorage.getItem('cardAction') || '退回重改'

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

  // 先确保回到「待审核」栏
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
    fire(btn || tabLeaf)
  }
  await sleep(1500)

  // 卡片动作：显示文案全等 + y > 140（排除 Tab 区）
  const cands = [...document.querySelectorAll('*')].filter((e) => {
    if (e.children.length !== 0) return false
    if (e.textContent.trim() !== want) return false
    const b = e.getBoundingClientRect()
    return b.width > 0 && b.y > 140
  })
  if (!cands.length) return JSON.stringify({ err: 'NOT_FOUND', want })

  const el0 = cands[0]
  let n = el0
  let btn = null
  while (n) {
    if (n.getAttribute && n.getAttribute('role') === 'button') { btn = n; break }
    n = n.parentElement
  }
  const target = btn || el0
  const bb = target.getBoundingClientRect()
  fire(target)
  await sleep(1000)

  // 抽屉打开后：读取「审核动作」与「审核意见」两组选项的字色（选中 = colors.primary）
  const OPT = ['通过', '驳回', '撤回', '同意', '不通过', '退回重改', '其他']
  const options = []
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length !== 0) continue
    const t = (e.textContent || '').trim()
    if (!OPT.includes(t)) continue
    const b = e.getBoundingClientRect()
    if (b.width <= 0) continue
    options.push({ t, y: Math.round(b.y), color: getComputedStyle(e).color })
  }
  options.sort((a, b) => a.y - b.y)

  return JSON.stringify({
    want,
    clickedY: Math.round(bb.y),
    sheetOpen: !!(document.body.innerText || '').includes('提交审核'),
    options,
  }, null, 1)
}
