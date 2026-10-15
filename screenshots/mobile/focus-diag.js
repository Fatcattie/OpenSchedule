// focus-diag.js —— 诊断「今日聚焦」页当前渲染了什么，用于定位为什么找不到可右滑的审核行。
// 用法（先注入目标分组，再执行本文件；同一条 bash 命令内）：
//   node pw.js eval "sessionStorage.setItem('diagTab','待我审核')"
//   node pw.js eval --file focus-diag.js
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = {}

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

  // 0) 可选：切到指定分组
  const want = sessionStorage.getItem('diagTab')
  if (want) {
    const leaf = [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && e.textContent.trim() === want,
    )
    if (leaf) firePointer(roleButtonOf(leaf) || leaf)
    await sleep(1800)
  }
  out.diagTab = want || '(未切换)'

  // 1) 当前分组（分段控件叶子）
  const TABS = ['今日到期', '待我审核', '临期预警']
  out.tabLeaves = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && TABS.includes(e.textContent.trim()))
    .map((e) => {
      const r = e.getBoundingClientRect()
      return { t: e.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), color: getComputedStyle(e).color }
    })

  // 2) 带 aria-label 的按钮（SwipeableRow 动作按钮与「查看详情」都会带）
  out.ariaButtons = [...document.querySelectorAll('[role="button"]')]
    .map((e) => {
      const r = e.getBoundingClientRect()
      return { label: e.getAttribute('aria-label'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
    })
    .filter((b) => b.label)

  // 3) 页面可见文案（截断）
  out.text = (document.body.innerText || '').replace(/\n+/g, ' / ').slice(0, 700)

  // 4) 右滑容器数量（SwipeableRow 的根是 position:relative + overflow:hidden）
  let swipeContainers = 0
  for (const e of document.querySelectorAll('div')) {
    const cs = getComputedStyle(e)
    if (cs.overflow === 'hidden' && cs.position === 'relative') swipeContainers += 1
  }
  out.swipeContainers = swipeContainers

  return JSON.stringify(out, null, 1)
}
