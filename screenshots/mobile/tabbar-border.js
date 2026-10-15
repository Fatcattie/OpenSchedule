// tabbar-border.js —— 读 TabBar 的边框细节与几何，评估「圆角顶 + 1px 上边框」是否冲突
// 用法：node pw.js eval --file tabbar-border.js
() => {
  // 用 shadow.raised 特征（上投影 -6px）精确定位 TabBar 外容器
  const bar = [...document.querySelectorAll('*')].find((e) => /-6px/.test(getComputedStyle(e).boxShadow));
  if (!bar) return 'NOT_FOUND';

  const s = getComputedStyle(bar);
  const b = bar.getBoundingClientRect();

  // 找 TabBar 后面真正透出的底色（逐级上溯找第一个不透明背景）
  let n = bar.parentElement;
  let behind = null;
  while (n) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { behind = bg; break; }
    n = n.parentElement;
  }
  if (!behind) behind = getComputedStyle(document.body).backgroundColor;

  return JSON.stringify(
    {
      borderTop: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      borderTopLeftRadius: s.borderTopLeftRadius,
      borderTopRightRadius: s.borderTopRightRadius,
      borderLeftWidth: s.borderLeftWidth,
      borderRightWidth: s.borderRightWidth,
      borderBottomWidth: s.borderBottomWidth,
      bg: s.backgroundColor,
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      padding: s.padding,
      overflow: s.overflow,
      behindTabBar: behind,
      cornerRisk:
        behind === s.backgroundColor
          ? '同色：圆角处无可见异色'
          : `圆角弧外将透出 ${behind}（TabBar 底色 ${s.backgroundColor}）`,
    },
    null,
    1,
  );
}
