// web-login.js —— 在 Web 端完成登录（mock 模式任意邮箱可登录）。
// 用法：node pw.js eval --file web-login.js
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const log = []

  const fire = (el) => {
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

  // React 受控输入必须走原生 setter + input 事件，否则 Form 收不到值
  const setInput = (sel, value) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  // ⚠️ AntD 会在两个中文字之间插空格（按钮渲染成「登 录」）⇒ 必须去空白后比较
  const norm = (s) => (s || '').replace(/\s+/g, '')
  const clickByText = (text) => {
    const want = norm(text)
    const leaf = [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && norm(e.textContent) === want,
    )
    if (!leaf) return false
    fire(leaf.closest('button') || leaf.closest('label') || leaf)
    return true
  }

  log.push('url0=' + location.pathname)

  if (location.pathname.includes('/login')) {
    log.push('email=' + setInput('input[name="email"], input#email, input[type="email"]', 'manager@demo.com'))
    log.push('pwd=' + setInput('input[name="password"], input#password, input[type="password"]', 'demo1234'))
    await sleep(300)
    log.push('submit=' + clickByText('登录'))
    await sleep(2500)
  }

  log.push('url1=' + location.pathname)
  const alert = document.querySelector('.ant-alert-message')
  if (alert) log.push('alert=' + alert.textContent.trim())
  return log.join(' | ')
}
