// transition-probe.js —— 证明「页面推入动画」真的在跑（而不是只配了参数）
// 用法：node pw.js eval --file transition-probe.js
//
// 原理：native-stack 的 slide_from_right 会把「进入的屏幕」用 transform: translateX(正值) 起步，
//       再收敛到 0。于是只要在点击后每 40ms 采样一次「宽元素的 transform」，
//       就能看到 x 位移从 ~屏宽 递减到 0 的**数值序列** —— 这是动画在跑的直接证据。
//       截图只能拍到一帧，容易误判；数值序列不会骗人。
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const fire = (el) => {
    const b = el.getBoundingClientRect();
    const o = {
      bubbles: true, cancelable: true, composed: true,
      clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  };

  // 取「内容区里的大块可点元素」= 一张卡片
  const cands = [...document.querySelectorAll('[role="button"]')].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 200 && b.height > 50 && b.y > 90 && b.y < 700;
  });
  const target = cands[0];
  if (!target) return 'NO_TARGET';

  const label = (target.textContent || '').trim().slice(0, 18);
  const path0 = location.pathname;

  // 采样：找出「宽元素」的 translateX，取每帧最大的 |x|（即正在滑入的那一层）
  const sample = () => {
    let best = null;
    for (const el of document.querySelectorAll('*')) {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none' || !t.startsWith('matrix')) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 300) continue;
      const m = /matrix\(([^)]+)\)/.exec(t);
      if (!m) continue;
      const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
      const tx = parts[4];
      if (!Number.isFinite(tx) || Math.abs(tx) < 0.5) continue;
      if (!best || Math.abs(tx) > Math.abs(best.tx)) best = { w: Math.round(b.width), tx: Math.round(tx * 10) / 10 };
    }
    return best;
  };

  const before = sample();
  fire(target);

  const timeline = [];
  for (let i = 0; i < 16; i++) {
    await sleep(40);
    const s = sample();
    timeline.push({ ms: (i + 1) * 40, tx: s ? s.tx : 0, w: s ? s.w : null });
  }

  const nonZero = timeline.filter((p) => p.tx !== 0);
  const firstTx = nonZero.length ? nonZero[0].tx : 0;
  const lastTx = timeline[timeline.length - 1].tx;

  return JSON.stringify(
    {
      from: path0,
      to: location.pathname,
      clickedLabel: label,
      beforeTransform: before,
      animated: nonZero.length > 0,
      firstObservedTx: firstTx,
      finalTx: lastTx,
      settled: lastTx === 0,
      frameCount: nonZero.length,
      timeline,
    },
    null,
    1,
  );
}
