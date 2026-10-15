// audit-buttons-diag.js —— 诊断「审核中心动作按钮缺失」
// 用法：node pw.js eval --file audit-buttons-diag.js
// 输出：当前 URL / 角色偏好 / 页面可见文本 / 各动作文案命中情况（含是否可上溯到 role=button）
() => {
  const TEXTS = ['通过', '不通过', '退回重改', '审核', '撤回', '待我审核', '待提报', '审核通过', '撤回审核']
  const hits = []
  for (const e of document.querySelectorAll('*')) {
    if (e.children.length !== 0) continue
    const t = (e.textContent || '').trim()
    if (!TEXTS.includes(t)) continue
    const b = e.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0) continue
    let p = e
    let btn = null
    while (p) {
      if (p.getAttribute && p.getAttribute('role') === 'button') { btn = p; break }
      p = p.parentElement
    }
    hits.push({
      text: t,
      hasButtonAncestor: !!btn,
      a11y: btn ? btn.getAttribute('aria-label') : null,
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.width),
      h: Math.round(b.height),
    })
  }
  hits.sort((a, b) => a.y - b.y || a.x - b.x)

  const ls = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      ls[k] = String(localStorage.getItem(k) || '').slice(0, 160)
    }
  } catch (err) {
    ls.__error = String(err)
  }

  return JSON.stringify(
    {
      url: location.href,
      rolePref: ls['os_pref_role'] ?? ls['os_preferences'] ?? '(未找到 role 偏好键)',
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
      hits,
      localStorageKeys: Object.keys(ls),
      localStorage: ls,
    },
    null,
    1,
  )
}
