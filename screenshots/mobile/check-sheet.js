// check-sheet.js —— 点击「退回 不通过」后核查抽屉：是否打开、动作是否预置为「驳回」
// 用法：node pw.js eval --file check-sheet.js
() => {
  const txt = document.body.innerText || ''
  const ariaSelected = [...document.querySelectorAll('[aria-selected]')].map((e) => ({
    t: e.textContent.trim().slice(0, 20),
    selected: e.getAttribute('aria-selected'),
  }))
  const radios = [...document.querySelectorAll('[role]')]
    .filter((e) => ['tab', 'radio', 'button'].includes(e.getAttribute('role')))
    .slice(0, 30)
    .map((e) => {
      const b = e.getBoundingClientRect()
      return (
        e.getAttribute('role') +
        '|' +
        e.textContent.trim().slice(0, 16).replace(/\n/g, '') +
        '|sel=' +
        (e.getAttribute('aria-selected') ?? e.getAttribute('aria-checked') ?? '-') +
        '|dis=' +
        (e.getAttribute('aria-disabled') ?? '-') +
        '|y=' +
        Math.round(b.y)
      )
    })
  return JSON.stringify(
    {
      path: location.pathname,
      ariaSelected,
      radios,
      head: txt.replace(/\n+/g, ' / ').slice(0, 400),
    },
    null,
    1,
  )
}
