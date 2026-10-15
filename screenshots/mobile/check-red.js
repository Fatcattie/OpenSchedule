// check-red.js —— 在审核中心页核验新增红字是否真的渲染 + 实际计算颜色
// 用法：node pw.js eval --file check-red.js
() => {
  const txt = document.body.innerText || ''
  const labels = ['退回 不通过', '审核通过']
  const nodes = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && labels.includes(e.textContent.trim()))
    .map((e) => {
      const cs = getComputedStyle(e)
      const b = e.getBoundingClientRect()
      return {
        text: e.textContent.trim(),
        color: cs.color,
        fontSize: cs.fontSize,
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.round(b.width),
        h: Math.round(b.height),
      }
    })
  return JSON.stringify(
    {
      path: location.pathname,
      hasTuihui: txt.includes('退回 不通过'),
      nodes,
      head: txt.replace(/\n+/g, ' / ').slice(0, 260),
    },
    null,
    2,
  )
}
