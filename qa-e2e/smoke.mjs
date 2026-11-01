/**
 * OpenSchedule 主流程冒烟（R8 收尾：Playwright + 已安装 Chrome，playwright-core 无需下载浏览器）
 *
 * 覆盖用户主流程（真实 UI × 真实 API，VITE_USE_MOCK 未开启）：
 *   注册租户(API) → 建成员账号(API) → 管理登录 → 发布团队协作任务（进入待承接池）
 *   → 成员登录 → 承接 → 标记完成 → 执行页提报完成 → 管理审核通过 → 服务端状态落地
 *
 * 前置：API 已启动（localhost:3000）、web dev server 已启动（localhost:5173，/api 反代到 3000）。
 * 运行：node qa-e2e/smoke.mjs
 * 产物：qa-e2e/smoke-evidence/*.png + qa-e2e/smoke-evidence/report.json
 *
 * 约定：AntD Button 会在两个汉字之间插入空格（「发布」渲染为「发 布」），
 *      故所有两字按钮一律用 /字\s*字/ 正则匹配可访问名。
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const API = process.env.SMOKE_API || 'http://localhost:3000/api/v1'
const WEB = process.env.SMOKE_WEB || 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const EVIDENCE = join(process.cwd(), 'qa-e2e', 'smoke-evidence')
const PASSWORD = 'Passw0rd!23'
const MEMBER_PASSWORD = 'Member!2345'

const steps = []
const log = (...a) => console.log('[smoke]', ...a)
const record = (name, ok, detail) => {
  steps.push({ step: name, ok, detail: String(detail).slice(0, 600), at: new Date().toISOString() })
  log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${String(detail).slice(0, 300)}`)
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json }
}

/** 断言辅助：失败也记录证据再抛出 */
function check(name, cond, detail) {
  record(name, Boolean(cond), detail)
  if (!cond) throw new Error(`断言失败：${name} — ${detail}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  mkdirSync(EVIDENCE, { recursive: true })
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: false }).catch(() => undefined)
}

async function uiLogin(page, email, password) {
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('邮箱').fill(email)
  await page.getByPlaceholder('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await page.waitForURL(/\/workspace/, { timeout: 25_000 })
}

/** 轮询服务器任务集合，等待 UI 写入落库（前端 setTasks 为乐观更新 + 异步串行提交，需等待） */
async function waitForTask(token, title, predicate, timeout = 25_000) {
  const deadline = Date.now() + timeout
  let last = null
  for (;;) {
    const res = await api('GET', '/workspace/tasks', { token })
    last = (res.json?.data?.items ?? []).map((i) => i.data).find((t) => t?.title === title) ?? null
    if (last && predicate(last)) return last
    if (Date.now() >= deadline) return last
    await sleep(500)
  }
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true })
  const nonce = Date.now()
  const ownerEmail = `smoke.owner.${nonce}@example.com`
  const memberEmail = `smoke.member.${nonce}@example.com`
  const taskTitle = `冒烟任务-${nonce}`

  // ── 1. 注册租户（API）：用户主流程前置账号，SPA 无注册页（见 recon） ──
  const reg = await api('POST', '/auth/register', {
    body: { email: ownerEmail, password: PASSWORD, displayName: '冒烟管理员', tenantName: `冒烟租户-${nonce}` },
  })
  check('注册租户（API 201 + 发双令牌）', reg.status === 201 && reg.json?.data?.accessToken, `http=${reg.status}`)
  const ownerToken = reg.json.data.accessToken
  const ownerId = reg.json.data.user.id
  const tenantId = reg.json.data.tenant.id

  // ── 2. 管理代建成员账号（API）→ 首次登录强制改密，先经 API 改密以便 UI 直达工作台 ──
  const mk = await api('POST', '/auth/members', {
    token: ownerToken,
    body: { email: memberEmail, password: PASSWORD, displayName: '冒烟成员', role: 'member' },
  })
  check('代建成员（API 201）', mk.status === 201, `http=${mk.status} body=${JSON.stringify(mk.json).slice(0, 200)}`)
  const memberId = mk.json.data.id ?? mk.json.data.user?.id

  const mLogin1 = await api('POST', '/auth/login', { body: { email: memberEmail, password: PASSWORD } })
  check(
    '成员首次登录标记强制改密',
    mLogin1.status === 201 && mLogin1.json?.data?.mustChangePassword === true,
    `http=${mLogin1.status} mustChangePassword=${mLogin1.json?.data?.mustChangePassword}`,
  )
  const mcp = await api('POST', '/auth/change-password', {
    token: mLogin1.json.data.accessToken,
    body: { currentPassword: PASSWORD, newPassword: MEMBER_PASSWORD },
  })
  check('成员改密（API 201）', mcp.status === 201, `http=${mcp.status}`)

  // ── 3. 浏览器：管理发布可承接任务 ──
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
  const ctxA = await browser.newContext({ viewport: { width: 1512, height: 945 }, locale: 'zh-CN' })
  const managerPage = await ctxA.newPage()
  managerPage.on('console', (m) => {
    if (m.type() === 'error') log('  [browser:console.error]', m.text().slice(0, 200))
  })

  try {
    await uiLogin(managerPage, ownerEmail, PASSWORD)
    check('管理 UI 登录落地 /workspace', /\/workspace/.test(managerPage.url()), `url=${managerPage.url()}`)
    await shot(managerPage, '01-manager-workspace')

    await managerPage.getByRole('button', { name: '发布任务/项目' }).first().click()
    const dlg = managerPage.locator('.ant-modal').filter({ hasText: 'SOP 流程' }).first()
    await dlg.waitFor({ state: 'visible', timeout: 15_000 })
    await dlg.getByPlaceholder('例如：完成官网首页改版').fill(taskTitle)
    await dlg.locator('textarea[placeholder*="需求确认与技术方案"]').fill('需求确认\n编码实现\n自测与联调')
    await shot(managerPage, '02-manager-publish-modal')
    await dlg.getByRole('button', { name: /发\s*布/ }).click()
    await dlg.waitFor({ state: 'detached', timeout: 20_000 })

    const published = await waitForTask(ownerToken, taskTitle, (t) => t.status === 'todo' && t.assigneeId === null)
    check(
      '发布后任务进入待承接池（assigneeId=null, status=todo）',
      Boolean(published) && published.assigneeId === null && published.status === 'todo',
      `status=${published?.status} assigneeId=${published?.assigneeId}`,
    )

    // ── 4. 成员：登录 → 承接 → 提报完成 ──
    const ctxB = await browser.newContext({ viewport: { width: 1512, height: 945 }, locale: 'zh-CN' })
    const memberPage = await ctxB.newPage()
    await uiLogin(memberPage, memberEmail, MEMBER_PASSWORD)
    await shot(memberPage, '03-member-workspace')

    await memberPage.getByRole('tab', { name: /任务协作/ }).click()
    const claimBtn = memberPage.getByRole('button', { name: /承\s*接/ }).first()
    await claimBtn.waitFor({ state: 'visible', timeout: 20_000 })
    await shot(memberPage, '04-member-claimable-board')
    await claimBtn.click()
    await memberPage.getByText(`已承接：${taskTitle}`).waitFor({ state: 'visible', timeout: 15_000 })
    record('成员承接任务（UI 承接按钮 + 成功提示）', true, `已承接：${taskTitle}`)

    const claimed = await waitForTask(ownerToken, taskTitle, (t) => t.assigneeId === memberId && t.status === 'in_progress')
    check(
      '承接落库（assigneeId=成员, status=in_progress）',
      claimed?.assigneeId === memberId && claimed?.status === 'in_progress',
      `assigneeId=${claimed?.assigneeId} expect=${memberId} status=${claimed?.status}`,
    )

    await memberPage.getByRole('button', { name: /标记完成/ }).first().click()
    await memberPage.waitForURL(/\/tasks\/.+\/execution/, { timeout: 20_000 })
    await shot(memberPage, '05-member-execution-page')

    await memberPage.getByRole('button', { name: '提报任务完成' }).first().click()
    const cdlg = memberPage.locator('.ant-modal').filter({ hasText: '提报任务完成' }).first()
    await cdlg.waitFor({ state: 'visible', timeout: 15_000 })
    // 完成标签与完成时间由表单预填（['按计划完成'] + 当前时间），只需补齐必填文本项
    await cdlg.getByPlaceholder('完成情况概述').fill('冒烟完成总结：主流程端到端跑通')
    await cdlg.getByPlaceholder('过程中的关键判断、踩坑与注意事项').fill('冒烟执行注意点')
    await cdlg.getByPlaceholder('对该类任务标准流程的优化建议').fill('冒烟 SOP 优化')
    await cdlg.getByPlaceholder('下次可改进的地方').fill('冒烟优化建议')
    await shot(memberPage, '06-member-completion-modal')
    await cdlg.getByRole('button', { name: '提交审核' }).click()
    await cdlg.waitFor({ state: 'detached', timeout: 20_000 })

    const pending = await waitForTask(
      ownerToken,
      taskTitle,
      (t) => t.approvalStatus === 'pending' && t.approvalType === 'completion',
    )
    check(
      '成员提报完成 → approvalStatus=pending（服务端落库）',
      pending?.approvalStatus === 'pending' && pending?.approvalType === 'completion',
      `approvalStatus=${pending?.approvalStatus} approvalType=${pending?.approvalType}`,
    )

    // ── 5. 管理：审核通过 → 闭环 ──
    await managerPage.goto(`${WEB}/workspace`, { waitUntil: 'domcontentloaded' })
    await managerPage.getByRole('tab', { name: /审核/ }).click()
    const approveBtn = managerPage.getByRole('button', { name: /通\s*过/ }).first()
    await approveBtn.waitFor({ state: 'visible', timeout: 20_000 })
    await shot(managerPage, '07-manager-approvals')
    await approveBtn.click()
    await managerPage.getByText(/审核已通过/).first().waitFor({ state: 'visible', timeout: 20_000 })

    const done = await waitForTask(
      ownerToken,
      taskTitle,
      (t) => t.status === 'done' && t.approvalStatus === 'approved',
    )
    check(
      '审核通过闭环（status=done, approvalStatus=approved, 有审核留痕）',
      done?.status === 'done' && done?.approvalStatus === 'approved' && (done?.auditLogs ?? []).length > 0,
      `status=${done?.status} approvalStatus=${done?.approvalStatus} auditLogs=${(done?.auditLogs ?? []).length}`,
    )
    await shot(managerPage, '08-manager-final-board')

    const audit = await api('GET', '/workspace/directory', { token: ownerToken })
    check(
      '通讯录包含管理+成员（D-07-2 角色投影）',
      audit.status === 200 && (audit.json?.data?.items ?? []).length >= 2,
      `http=${audit.status} items=${(audit.json?.data?.items ?? []).length}`,
    )

    await ctxB.close()
    await ctxA.close()
    record('冒烟主流程', true, `tenant=${tenantId} owner=${ownerId} member=${memberId} task=${taskTitle}`)
  } catch (err) {
    await shot(managerPage, '99-failure-manager').catch(() => undefined)
    record('冒烟主流程', false, err?.message ?? String(err))
    throw err
  } finally {
    await browser.close()
    writeFileSync(
      join(EVIDENCE, 'report.json'),
      JSON.stringify({ ranAt: new Date().toISOString(), api: API, web: WEB, steps }, null, 2),
    )
  }
}

main()
  .then(() => {
    console.log('[smoke] OK — 主流程冒烟通过')
    process.exit(0)
  })
  .catch((err) => {
    console.error('[smoke] FAILED —', err?.stack ?? err)
    process.exit(1)
  })
