// press-probe-scale.js —— 实测「缩放反馈」是否生效（针对非全宽元素：图标 / FAB / 卡片）
// 用法：node pw.js eval --file press-probe-scale.js
// 目标写法："label:返回"（按 aria-label 定位）或 "text:通知偏好"（按文本定位）
// 只派发 pointerdown/pointerup，不派发 click，避免触发导航或提交
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const pointer = (el, kind) => {
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
      buttons: kind === 'down' ? 1 : 0,
    };
    if (kind === 'down') {
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
    } else {
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
    }
  };

  const visible = (e) => {
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };

  // 上溯到 role=button / <button>
  const toButton = (start) => {
    let n = start;
    while (n) {
      if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) return n;
      n = n.parentElement;
    }
    return null;
  };

  const resolve = (spec) => {
    const [kind, ...rest] = spec.split(':');
    const value = rest.join(':');
    if (kind === 'label') {
      const el = [...document.querySelectorAll('[aria-label]')].find(
        (e) => e.getAttribute('aria-label') === value && visible(e),
      );
      return el ? toButton(el) || el : null;
    }
    const leaf = [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && e.textContent.includes(value) && visible(e),
    );
    return leaf ? toButton(leaf) : null;
  };

  const scaleOf = (t) => {
    const m = /matrix\(([-\d.]+),/.exec(t || '');
    return m ? Math.round(Number(m[1]) * 1000) / 1000 : null;
  };

  const bgOf = (el) => {
    let n = el;
    while (n) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      n = n.parentElement;
    }
    return null;
  };

  const targets = [
    'label:返回',
    'label:查看依赖',
    'label:切换状态',
    'label:添加附件',
    'label:关闭',
    'text:通知偏好',
  ];
  const out = { path: location.pathname, results: [] };

  for (const spec of targets) {
    const btn = resolve(spec);
    if (!btn) {
      out.results.push({ target: spec, found: false });
      continue;
    }
    const tBefore = getComputedStyle(btn).transform;
    const bgBefore = bgOf(btn);

    pointer(btn, 'down');
    await sleep(450);
    const tDuring = getComputedStyle(btn).transform;
    const bgDuring = bgOf(btn);

    pointer(btn, 'up');
    await sleep(700);
    const tAfter = getComputedStyle(btn).transform;

    out.results.push({
      target: spec,
      found: true,
      scaleBefore: scaleOf(tBefore),
      scaleDuring: scaleOf(tDuring),
      scaleAfter: scaleOf(tAfter),
      scaled: tBefore !== tDuring,
      scaleRestored: tBefore === tAfter,
      bgBefore,
      bgDuring,
      bgChanged: bgBefore !== bgDuring,
    });
  }

  return JSON.stringify(out, null, 1);
}
