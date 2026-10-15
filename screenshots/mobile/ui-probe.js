// ui-probe.js —— 在真实浏览器里实测「圆角 / 阴影」落地情况
// 用法：node pw.js eval --file ui-probe.js
// 输出：圆角计算值直方图 + 阴影计算值直方图（用于改造前/后对比）
() => {
  const radius = {};
  const shadow = {};
  const els = document.querySelectorAll('*');

  for (const el of els) {
    const cs = getComputedStyle(el);
    const r = cs.borderRadius;
    if (r && r !== '0px') {
      const nonzero = r.split(/\s+/).filter((p) => p !== '0px');
      if (nonzero.length) radius[r] = (radius[r] || 0) + 1;
    }
    const s = cs.boxShadow;
    if (s && s !== 'none') shadow[s] = (shadow[s] || 0) + 1;
  }

  const top = (obj, n) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ value: k, count: v }));

  const box = document.body.getBoundingClientRect();

  return JSON.stringify(
    {
      path: location.pathname,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      doc: { w: Math.round(box.width), h: Math.round(box.height) },
      radiusHistogram: top(radius, 24),
      shadowHistogram: top(shadow, 12),
    },
    null,
    1,
  );
}
