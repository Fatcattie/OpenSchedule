// tab-anim-probe.js —— 检测「Tab 切换动画（animation: 'shift'）」在 Web 上是否真的有补间
// 用法：node pw.js eval --file tab-anim-probe.js
//
// 与 transition-probe2.js 同法：rAF 逐帧收集全页所有非 none 的 transform，
// 看是否出现**横向**平移（tx != 0）或其它补间序列。
// 若只有 tx=0 的纵向微位移 → 说明切换是瞬时的，动画未在 Web 生效。
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

  // 找「今日」这个 Tab
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const target = tabs.find((t) => (t.textContent || '').includes('今日')) || tabs[1];
  if (!target) return 'NO_TAB';

  const label = (target.textContent || '').trim().slice(0, 8);
  const path0 = location.pathname;

  const seen = new Map();
  let frames = 0;
  let running = true;
  const loop = () => {
    if (!running) return;
    for (const el of document.querySelectorAll('*')) {
      const t = getComputedStyle(el).transform;
      if (t && t !== 'none' && !seen.has(t)) seen.set(t, frames);
    }
    frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  await sleep(150);
  fire(target);
  await sleep(900);
  running = false;

  const all = [...seen.keys()];
  const parse = (t) => {
    const m = /matrix\(([^)]+)\)/.exec(t);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { tx: p[4], ty: p[5], scale: p[0] };
  };
  const horizontal = all.filter((t) => { const p = parse(t); return p && Math.abs(p.tx) > 0.5; });
  const vertical = all.filter((t) => { const p = parse(t); return p && Math.abs(p.tx) <= 0.5 && Math.abs(p.ty) > 0.5; });
  const scaled = all.filter((t) => { const p = parse(t); return p && Math.abs(p.scale - 1) > 0.001; });

  return JSON.stringify(
    {
      from: path0,
      to: location.pathname,
      clickedTab: label,
      tabSelectedAfter: target.getAttribute('aria-selected'),
      framesSampled: frames,
      distinctTransformCount: all.length,
      horizontalCount: horizontal.length,
      verticalCount: vertical.length,
      scaleCount: scaled.length,
      horizontalSlideDetected: horizontal.length > 1,
      horizontalSamples: horizontal.slice(0, 8),
      verticalSamples: vertical.slice(0, 8),
      scaleSamples: scaled.slice(0, 8),
    },
    null,
    1,
  );
}
