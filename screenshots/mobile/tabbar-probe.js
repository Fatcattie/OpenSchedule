// tabbar-probe.js —— 精确定位底部 TabBar，读其计算样式（圆角 / 阴影 / 边框 / 底色）
// 用法：node pw.js eval --file tabbar-probe.js
// 为何需要：上一版探针用「width>300 && height>40 && borderTopLeftRadius!=0px 取首个」
//           的启发式定位，结果命中了某张 Card（20px 圆角 + 1px 上边框 + 向下阴影），
//           导致 TabBar 证据不可信。本探针改为按 role="tablist" 语义定位。
() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const brief = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const s = cs(el);
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      cls: (el.className || '').toString().slice(0, 60),
      rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      bg: s.backgroundColor,
      radius: s.borderRadius,
      borderTop: s.borderTopWidth + ' ' + s.borderTopStyle,
      boxShadow: s.boxShadow,
      overflow: s.overflow,
      position: s.position,
      zIndex: s.zIndex,
    };
  };

  const out = { path: location.pathname, viewport: { w: innerWidth, h: innerHeight } };

  // 1) 语义定位：tablist
  const tablist = document.querySelector('[role="tablist"]');
  out.tablist = brief(tablist);

  // 2) 交叉验证：全页所有「顶部圆角非 0」的元素（找出真正带圆角顶的那个）
  out.roundedTops = [...document.querySelectorAll('*')]
    .map((el) => ({ el, s: cs(el) }))
    .filter(({ s }) => s.borderTopLeftRadius !== '0px' || s.borderTopRightRadius !== '0px')
    .map(({ el }) => brief(el))
    .slice(0, 12);

  // 3) 交叉验证：全页所有「含 -6px 上投影」的元素（shadow.raised 特征）
  out.raisedShadowEls = [...document.querySelectorAll('*')]
    .map((el) => ({ el, s: cs(el) }))
    .filter(({ s }) => /-6px/.test(s.boxShadow))
    .map(({ el }) => brief(el))
    .slice(0, 8);

  // 4) 父容器底色 —— 用于判断「圆角顶两角是否露出异色」
  if (tablist) {
    out.parent = brief(tablist.parentElement);
    out.grandparent = brief(tablist.parentElement && tablist.parentElement.parentElement);

    // 5) 子 Tab 列表（确认 TabBar 内容完整）
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    out.tabs = tabs.map((t) => ({
      label: (t.textContent || '').trim().slice(0, 12),
      selected: t.getAttribute('aria-selected'),
      bg: cs(t).backgroundColor,
    }));
    out.tabCount = tabs.length;

    // 6) 角部异色探测：比较 TabBar 底色 vs 父容器底色（若不同 → 圆角处会露出父底色）
    const barBg = cs(tablist).backgroundColor;
    const parBg = cs(tablist.parentElement).backgroundColor;
    out.cornerContrast = {
      barBg,
      parentBg: parBg,
      differs: barBg !== parBg,
      note: barBg === parBg ? '同色，圆角处无可见异色' : '不同色 → 圆角裁切处可能露出父底色（需肉眼确认）',
    };
  }

  return JSON.stringify(out, null, 1);
}
