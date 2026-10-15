// count-nested-buttons.js —— 直接在真实 DOM 里统计「嵌套 <button>」。
// 为什么这样测：React 的 `validateDOMNesting` 告警只在 DEV 构建存在，生产包会被剥离，
// 所以「控制台 0 errors」在生产包上永远成立、证明不了任何事。
// 但**嵌套本身**是 DOM 结构事实，任何构建都能观测 —— `button button` 选择器即可。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await sleep(600)
  const nested = document.querySelectorAll('button button')
  return JSON.stringify({
    path: location.pathname,
    totalButtons: document.querySelectorAll('button').length,
    nestedButtons: nested.length,
    samples: [...nested].slice(0, 5).map((b) => ({
      text: (b.textContent || '').trim().slice(0, 12),
      label: b.getAttribute('aria-label'),
    })),
  })
}
