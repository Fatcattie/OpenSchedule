// press-probe.js —— 实测「按下反馈」是否真的生效且可见
// 用法：node pw.js eval --file press-probe.js
// 做法：对目标派发 pointerdown（不派发 click，因此不会触发跳转），
//       等 spring 稳定后读 getComputedStyle 的 backgroundColor 与 transform，
//       再 pointerup 复测恢复情况。用数据证明反馈可见，而不是靠肉眼。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 只在 pointerdown / pointerup 之间测量，绝不派发 click，避免触发导航
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

  // 按子串找叶子节点 → 上溯到 role=button 的可点祖先
  const findButton = (sub) => {
    const cands = [...document.querySelectorAll('*')].filter((e) => {
      if (!e.textContent.includes(sub)) return false;
      if (e.children.length !== 0) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0;
    });
    const leaf = cands[0];
    if (!leaf) return null;
    let n = leaf;
    while (n) {
      if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) return n;
      n = n.parentElement;
    }
    return null;
  };

  // 取自身背景色（不透明才算数），否则向上找最近的实底祖先
  const bgOf = (el) => {
    let n = el;
    while (n) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      n = n.parentElement;
    }
    return null;
  };

  const parseRgb = (s) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s || '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };

  const delta = (a, b) => {
    const x = parseRgb(a);
    const y = parseRgb(b);
    if (!x || !y) return null;
    const d = Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
    return { rgbSumDiff: d, percent: Math.round((d / 765) * 1000) / 10 };
  };

  const targets = ['通知偏好', '个人计划', '时区', '关于 OpenSchedule', '全部已读', '记住我'];
  const out = { path: location.pathname, results: [] };

  for (const t of targets) {
    const btn = findButton(t);
    if (!btn) {
      out.results.push({ target: t, found: false });
      continue;
    }
    const beforeBg = bgOf(btn);
    const beforeTransform = getComputedStyle(btn).transform;

    pointer(btn, 'down');
    await sleep(450);
    const duringBg = bgOf(btn);
    const duringTransform = getComputedStyle(btn).transform;

    pointer(btn, 'up');
    await sleep(600);
    const afterBg = bgOf(btn);
    const afterTransform = getComputedStyle(btn).transform;

    out.results.push({
      target: t,
      found: true,
      bgBefore: beforeBg,
      bgDuring: duringBg,
      bgAfter: afterBg,
      bgChanged: beforeBg !== duringBg,
      bgRestored: beforeBg === afterBg,
      contrast: delta(beforeBg, duringBg),
      transformBefore: beforeTransform,
      transformDuring: duringTransform,
      transformAfter: afterTransform,
      scaled: beforeTransform !== duringTransform,
      scaleRestored: beforeTransform === afterTransform,
    });
  }

  return JSON.stringify(out, null, 1);
}
