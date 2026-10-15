// check-buttons.js —— 核验审核中心两个动作是否渲染为「浅底 + 描边」按钮，并取实际计算样式
// 用法：node pw.js eval --file check-buttons.js
() => {
  const out = []
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length !== 0) continue
    const t = (e.textContent || '').trim()
    if (t !== '审核通过' && t !== '退回 不通过') continue
    const b = e.getBoundingClientRect()
    if (b.width <= 0 || b.y <= 140) continue // 排除四栏 Tab（y≈90）
    const cs = getComputedStyle(e)
    let p = e
    let btn = null
    while (p) {
      if (p.getAttribute && p.getAttribute('role') === 'button') { btn = p; break }
      p = p.parentElement
    }
    const bs = btn ? getComputedStyle(btn) : null
    out.push({
      text: t,
      y: Math.round(b.y),
      textColor: cs.color,
      bg: bs ? bs.backgroundColor : null,
      borderColor: bs ? bs.borderTopColor : null,
      borderWidth: bs ? bs.borderTopWidth : null,
      borderRadius: bs ? bs.borderRadius : null,
      box: Math.round(b.width) + 'x' + Math.round(b.height),
    })
    if (out.length >= 4) break
  }
  return JSON.stringify(out, null, 1)
}
