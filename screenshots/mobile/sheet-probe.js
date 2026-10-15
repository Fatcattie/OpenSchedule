// sheet-probe.js —— 检查底部抽屉（BottomSheet）的圆角 / 阴影 / 把手渲染
// 用法：先点开一个 BottomSheet，再 node pw.js eval --file sheet-probe.js
// 依据：radius.sheet = 28px，是本项目最大的圆角档；抽屉是「圆润度」最显眼的载体之一
() => {
  const brief = (el) => {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      rect: { y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      radius: s.borderRadius,
      bg: s.backgroundColor,
      shadow: s.boxShadow,
      borderTop: s.borderTopWidth,
      overflow: s.overflow,
      text: (el.textContent || '').trim().slice(0, 24),
    };
  };

  const all = [...document.querySelectorAll('*')];

  // 1) 所有「顶部两角 = 28px」的元素 —— 抽屉本体
  const sheets = all
    .map((el) => ({ el, s: getComputedStyle(el) }))
    .filter(({ s }) => s.borderTopLeftRadius === '28px' && s.borderTopRightRadius === '28px')
    .map(({ el }) => brief(el));

  // 2) 抽屉顶部的把手（宽 36 高 4 的小胶囊）
  const handles = all
    .map((el) => ({ el, s: getComputedStyle(el) }))
    .filter(({ el, s }) => {
      const b = el.getBoundingClientRect();
      return Math.round(b.width) === 36 && Math.round(b.height) === 4 && s.borderRadius === '999px';
    })
    .map(({ el }) => brief(el));

  // 3) 遮罩（半透明覆盖层）
  const backdrops = all
    .map((el) => ({ el, s: getComputedStyle(el) }))
    .filter(({ el, s }) => {
      const b = el.getBoundingClientRect();
      return b.width >= innerWidth - 1 && b.height >= innerHeight - 1 && /rgba\(/.test(s.backgroundColor) && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
    })
    .map(({ el }) => brief(el));

  return JSON.stringify({ path: location.pathname, sheetCount: sheets.length, sheets, handles, backdrops: backdrops.slice(0, 3) }, null, 1);
}
