// pw.js —— playwright-cli 直调封装（绕过 bash / cmd 引号问题）
// 用法:
//   node pw.js eval "<js 表达式>"
//   node pw.js eval --file <js 文件>
//   node pw.js click "<精确文本>"        （textContent.trim() 全等 + 叶子节点，派发完整指针序列）
//   node pw.js dump  "<精确文本>"        （只列出候选，不点击）
//   node pw.js <其它 playwright-cli 子命令> [args...]
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const NODE = process.execPath
const CLI = 'C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node_modules/@playwright/cli/playwright-cli.js'

function run(args) {
  try {
    const out = execFileSync(NODE, [CLI, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return out
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + `\n[exit=${e.status}]`
  }
}

const [cmd, ...rest] = process.argv.slice(2)

if (cmd === 'eval') {
  let js
  if (rest[0] === '--file') js = fs.readFileSync(rest[1], 'utf8')
  else js = rest[0]
  process.stdout.write(run(['eval', js]))
} else if (cmd === 'click' || cmd === 'dump') {
  const text = rest[0]
  const dump = cmd === 'dump'
  const js = `() => {
  const t = ${JSON.stringify(text)};
  const all = [...document.querySelectorAll('*')].filter(e => e.textContent.trim() === t && e.children.length === 0);
  ${dump
      ? `return JSON.stringify(all.map(e => { const b = e.getBoundingClientRect(); return { tag: e.tagName, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }));`
      : `const el = all.find(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) || all[0];
  if (!el) return 'NOT_FOUND';
  let n = el, btn = null;
  while (n) { if (n.getAttribute && (n.getAttribute('role') === 'button' || n.tagName === 'BUTTON')) { btn = n; break } n = n.parentElement }
  btn = btn || el;
  const b = btn.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, composed: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
  btn.dispatchEvent(new PointerEvent('pointerdown', o));
  btn.dispatchEvent(new MouseEvent('mousedown', o));
  btn.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  btn.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
  btn.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  return 'ok:' + (btn.textContent || '').trim().slice(0, 28);`}
}`
  process.stdout.write(run(['eval', js]))
} else {
  process.stdout.write(run([cmd, ...rest]))
}
