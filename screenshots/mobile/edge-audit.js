// edge-audit.js —— 系统排查「圆角 + 单侧边框」这种「硬边泄漏」签名
// 用法：node pw.js eval --file edge-audit.js
//
// 背景：TabBar 曾出现「28px 圆角 + 向上投影」之上还叠着 1px hairline 上边框，
//       根因是 @react-navigation/bottom-tabs 的默认 tabBarStyle 透传。
//       该缺陷的通用签名是：元素有圆角，但只有上边或下边有边框（左右为 0）。
//       正常卡片是四边都有边框（l/r 不为 0），所以不会误报。
//       圆角容器内的首/末行（有 borderRadius + 行分隔线）也会命中，属预期，需人工判断。
() => {
  const items = [];

  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.borderRadius === '0px') continue;

    const t = parseFloat(s.borderTopWidth) || 0;
    const b = parseFloat(s.borderBottomWidth) || 0;
    const l = parseFloat(s.borderLeftWidth) || 0;
    const r = parseFloat(s.borderRightWidth) || 0;

    // 命中条件：上或下有边框，但左右都没有 —— 「硬边压在圆角上」
    if ((t || b) && !(l || r)) {
      const rect = el.getBoundingClientRect();
      items.push({
        tag: el.tagName,
        role: el.getAttribute('role'),
        rect: { y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        radius: s.borderRadius,
        borderTop: t ? `${t}px ${s.borderTopColor}` : '-',
        borderBottom: b ? `${b}px ${s.borderBottomColor}` : '-',
        bg: s.backgroundColor,
        shadow: s.boxShadow === 'none' ? '-' : s.boxShadow,
        text: (el.textContent || '').trim().slice(0, 14),
      });
    }
  }

  return JSON.stringify(
    { path: location.pathname, viewport: { w: innerWidth, h: innerHeight }, count: items.length, items: items.slice(0, 18) },
    null,
    1,
  );
}
