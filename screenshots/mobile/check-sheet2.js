// check-sheet2.js —— 判定抽屉内「通过 / 驳回」哪个处于选中态 + 「提交审核」是否禁用
// 用法：node pw.js eval --file check-sheet2.js
() => {
  const norm = (s) => s.replace(/\s+/g, '')
  const seg = []
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length !== 0) continue
    const t = norm(e.textContent || '')
    if (t !== '通过' && t !== '驳回' && t !== '撤回') continue
    const b = e.getBoundingClientRect()
    if (b.width <= 0) continue
    const cs = getComputedStyle(e)
    let p = e
    const chain = []
    for (let i = 0; i < 3 && p; i++) {
      const pcs = getComputedStyle(p)
      chain.push(p.tagName + '{bg:' + pcs.backgroundColor + ',br:' + pcs.borderRadius + '}')
      p = p.parentElement
    }
    seg.push({
      text: t,
      color: cs.color,
      fontWeight: cs.fontWeight,
      y: Math.round(b.y),
      chain,
    })
  }

  const findBtn = (label) => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length !== 0) continue
      if ((e.textContent || '').trim() !== label) continue
      let n = e
      while (n) {
        if (n.getAttribute && n.getAttribute('role') === 'button') return n
        n = n.parentElement
      }
      return e
    }
    return null
  }
  const submit = findBtn('提交审核')
  const submitInfo = submit
    ? {
        ariaDisabled: submit.getAttribute('aria-disabled'),
        opacity: getComputedStyle(submit).opacity,
      }
    : null

  return JSON.stringify({ seg, submitInfo }, null, 1)
}
