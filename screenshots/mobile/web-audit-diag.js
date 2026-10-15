// web-audit-diag.js —— 诊断 Web 审核中心（/audit）的审核按钮是否缺失
// 用法：node pw.js eval --file web-audit-diag.js
() => {
  const txt = (document.body.innerText || '').replace(/\s+/g, ' ')
  const btns = [...document.querySelectorAll('button')]
    .map((b) => (b.innerText || '').trim())
    .filter(Boolean)

  const cols = {}
  for (const k of ['待提报', '待审核', '审核通过', '撤回审核']) {
    const i = txt.indexOf(k)
    cols[k] = i >= 0 ? txt.slice(i, i + 14) : '(未找到)'
  }

  const ls = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const v = String(localStorage.getItem(k) || '')
      ls[k] = v.length > 200 ? v.slice(0, 200) + `…(len=${v.length})` : v
    }
  } catch (e) {
    ls.__error = String(e)
  }

  return JSON.stringify(
    {
      url: location.href,
      title: document.title,
      cols,
      allButtons: btns.slice(0, 40),
      auditButtons: btns.filter((b) => b.includes('审核')),
      localStorageKeys: Object.keys(ls),
      localStorage: ls,
      bodyText: txt.slice(0, 1000),
    },
    null,
    1,
  )
}
