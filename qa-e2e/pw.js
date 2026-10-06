// pw.js —— 直调 playwright-cli 的 JS 入口，shell:false 传参，零引号冲突
// 用法: node pw.js --browser=chrome open <url>
//       node pw.js --browser=chrome resize 390 844
//       node pw.js --browser=chrome eval "<js>" | node pw.js --browser=chrome eval --file ./probe.js
//       node pw.js --browser=chrome snapshot
//       node pw.js --browser=chrome screenshot --filename=./x.png
const { execFileSync } = require('child_process')
const NODE = 'C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe'
const CLI = 'C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node_modules/@playwright/cli/playwright-cli.js'
const run = (args) => {
  try {
    return execFileSync(NODE, [CLI, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 })
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') + `\n[exit=${e.status}]`
  }
}
const args = process.argv.slice(2)
process.stdout.write(run(args))
