// audit-center-diag.js —— dump 审核中心页的按钮与文案
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await sleep(500)
  const out = {}
  out.path = location.pathname
  out.buttons = [...document.querySelectorAll('[role="button"]')]
    .map((e) => {
      const r = e.getBoundingClientRect()
      return {
        label: e.getAttribute('aria-label'),
        text: (e.textContent || '').trim().slice(0, 14),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
      }
    })
    .filter((b) => (b.label || b.text) && b.w > 0)
  out.text = (document.body.innerText || '').replace(/\n+/g, ' / ').slice(0, 900)
  return JSON.stringify(out, null, 1)
}
