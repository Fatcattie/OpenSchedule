// check-three-buttons.js —— 核验审核中心「待审核」卡片三枚动作（通过 / 不通过 / 退回重改）
// 是否渲染为「浅底 + 描边 + 同色字」的柔和按钮，并取实际计算样式。
// 用法：node pw.js eval --file check-three-buttons.js
// 关键：显示文案与抽屉选项同名 ⇒ 必须按 y 坐标排除顶部四栏 Tab（y≈90）
() => {
  const TEXTS = ['通过', '不通过', '退回重改']
  const out = []
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length !== 0) continue
    const t = (e.textContent || '').trim()
    if (!TEXTS.includes(t)) continue
    const b = e.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0) continue
    if (b.y <= 140) continue // 排除四栏 Tab 区
    // 必须能上溯到 role=button
    let p = e
    let btn = null
    while (p) {
      if (p.getAttribute && p.getAttribute('role') === 'button') { btn = p; break }
      p = p.parentElement
    }
    if (!btn) continue
    const cs = getComputedStyle(e)
    const bs = getComputedStyle(btn)
    out.push({
      text: t,
      a11y: btn.getAttribute('aria-label'),
      y: Math.round(b.y),
      textColor: cs.color,
      bg: bs.backgroundColor,
      borderColor: bs.borderTopColor,
      borderWidth: bs.borderTopWidth,
      borderRadius: bs.borderRadius,
      box: Math.round(b.width) + 'x' + Math.round(b.height),
    })
  }
  out.sort((a, b) => a.y - b.y)
  return JSON.stringify(out, null, 1)
}
