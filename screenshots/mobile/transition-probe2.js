// transition-probe2.js —— 用 rAF 全量采集「导航瞬间出现过的所有 transform」
// 用法：node pw.js eval --file transition-probe2.js
//
// 比 transition-probe.js 更宽：不预设元素宽度/位置，rAF 逐帧收集**全页所有**非 none 的 transform，
// 最后看「是否出现过多个不同的 translateX 值」。若动画真的在跑，必然出现一串递增/递减的 tx。
// 若全程只有 1 个（或 0 个）transform 值 → 说明是瞬间切换，没有补间动画。
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

  const cands = [...document.querySelectorAll('[role="button"]')].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width > 200 && b.height > 50 && b.y > 90 && b.y < 700;
  });
  const target = cands[0];
  if (!target) return 'NO_TARGET';

  const label = (target.textContent || '').trim().slice(0, 18);
  const path0 = location.pathname;

  const seen = new Map(); // transform 值 -> 首次出现帧号
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

  await sleep(150);            // 先采基线
  const baselineSize = seen.size;
  fire(target);                // 触发导航
  await sleep(800);            // 覆盖 340ms 动画 + 余量
  running = false;

  const all = [...seen.keys()];
  // 只保留含平移分量的 matrix（tx 或 ty 非 0），那才是"滑动"
  const translated = all.filter((t) => {
    const m = /matrix\(([^)]+)\)/.exec(t);
    if (!m) return false;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return Math.abs(p[4]) > 0.5 || Math.abs(p[5]) > 0.5;
  });

  return JSON.stringify(
    {
      from: path0,
      to: location.pathname,
      clickedLabel: label,
      framesSampled: frames,
      distinctTransformCount: all.length,
      baselineDistinctCount: baselineSize,
      translatedTransformCount: translated.length,
      animationDetected: translated.length > 1,
      translatedSamples: translated.slice(0, 12),
      otherSamples: all.filter((t) => !translated.includes(t)).slice(0, 5),
    },
    null,
    1,
  );
}
