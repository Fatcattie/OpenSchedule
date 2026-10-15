// web-fill-submit.js —— 填满「提报任务完成」弹窗的 4 个必填项并提交
// 用法：node pw.js eval --file web-fill-submit.js
// 目的：验证「完成提报 → approvalStatus=pending → 审核页出现审核按钮」这条正路是否通畅
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const MAP = [
    ['完成情况概述', '已完成首屏与导航高保真原型，列表页待补充'],
    ['过程中的关键判断、踩坑与注意事项', '先锁定设计 token 再走查，返工明显减少'],
    ['对该类任务标准流程的优化建议', '建议把设计 token 评审前置到需求阶段'],
    ['下次可改进的地方', '提前与后端确认接口字段'],
  ]

  const log = []
  for (const [ph, val] of MAP) {
    const el = [...document.querySelectorAll('textarea')].find((t) => (t.placeholder || '') === ph)
    if (!el) {
      log.push('MISS:' + ph)
      continue
    }
    setVal(el, val)
    log.push('SET:' + ph)
  }
  await sleep(300)

  const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '提交审核')
  if (!btn) return log.join(' | ') + ' | NO_SUBMIT_BTN'

  const r = btn.getBoundingClientRect()
  const o = {
    bubbles: true, cancelable: true, composed: true,
    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
  }
  btn.dispatchEvent(new PointerEvent('pointerdown', o))
  btn.dispatchEvent(new MouseEvent('mousedown', o))
  btn.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
  btn.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
  btn.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  log.push('CLICKED')
  await sleep(2500)

  const msg = [...document.querySelectorAll('.ant-message-notice-content')].map((x) => x.innerText.trim())
  const err = [...document.querySelectorAll('.ant-form-item-explain')].map((x) => x.innerText.trim())
  const t = JSON.parse(localStorage.getItem('os_ws_v1_tasks') || '[]')
  const cur = t.find((x) => x.id === 'task-004')
  log.push('MSG=' + JSON.stringify(msg))
  log.push('ERR=' + JSON.stringify(err))
  log.push('TASK004=' + JSON.stringify({ status: cur?.status, approvalStatus: cur?.approvalStatus, approvalType: cur?.approvalType }))
  return log.join(' | ')
}
