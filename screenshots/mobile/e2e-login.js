// e2e-login.js —— 在预览站完成登录（演示账号一键填入 + 登录）
// 用法：node pw.js eval --file e2e-login.js
// 返回：跳转前后的 pathname，用于确认登录是否成功
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const fire = (el) => {
    const b = el.getBoundingClientRect();
    const o = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: b.x + b.width / 2,
      clientY: b.y + b.height / 2,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  };

  // 找叶子节点，且必须能上溯到 role=button / <button>，避免误点页面标题
  const findButton = (sub, exact = false) => {
    const cands = [...document.querySelectorAll('*')].filter((e) => {
      const t = e.textContent.trim();
      if (exact ? t !== sub : !t.includes(sub)) return false;
      if (e.children.length !== 0) return false;
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return false;
      let n = e;
      while (n) {
        if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) {
          return true;
        }
        n = n.parentElement;
      }
      return false;
    });
    return cands[0] ?? null;
  };

  const clickButton = (sub, exact = false) => {
    const leaf = findButton(sub, exact);
    if (!leaf) return false;
    let n = leaf;
    let btn = null;
    while (n) {
      if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) {
        btn = n;
        break;
      }
      n = n.parentElement;
    }
    fire(btn || leaf);
    return true;
  };

  const log = [];
  log.push('url0=' + location.pathname);

  log.push('demoFill=' + clickButton('点击填入'));
  await sleep(700);

  log.push('loginClick=' + clickButton('登录', true));
  await sleep(2200);

  log.push('url1=' + location.pathname);

  const err = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && /失败|错误|不正确|无效/.test(e.textContent))
    .map((e) => e.textContent.trim())
    .slice(0, 3);
  if (err.length) log.push('errText=' + JSON.stringify(err));

  return log.join(' | ');
}
