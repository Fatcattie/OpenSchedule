# QA · 增量 11 附件上传 · 真实分支浏览器端到端验证（尽力而为）

- 日期：2026-10-07
- 执行人：Edward（QA · `qa-real-browser`）
- 仓库：`D:\GLMclaw\workspace\openschedule`
- 目标：在**真实分支**（`EXPO_PUBLIC_USE_MOCK=false`）下，用浏览器（系统 Chrome）驱动**真实 HTTP + 真实 multipart**，验证增量 11「任务附件上传」链路端到端可用。
- 结论：**核心链路验证通过（PASS）**。真实分支下：登录 → 任务详情 → 打开上传抽屉 → 选择文件 → 浏览器真实 `File` 组 `FormData` → `POST /api/v1/attachments`（multipart，自动带 boundary）→ 桩服务解析出全部 3 个字段 → UI 列表显示上传后的附件。

> ⚠️ 说明：本文档为 **best-effort** 验证。桩服务只覆盖到达目标链路所需的 API 面，**不校验 token / 租户 / RBAC**；native（iOS/Android）取图路径未覆盖。盲区见文末。

---

## 1. 环境与产物

| 项 | 值 |
| --- | --- |
| 应用 | `apps/mobile`（Expo SDK 57 / RN 0.86 / TS） |
| 真实分支开关 | `EXPO_PUBLIC_USE_MOCK=false`（`src/services/config.ts:12`，模块加载期只求值一次） |
| API 基址 | `/api/v1`（相对路径，`src/services/config.ts:6`）⇒ 桩服务必须**同源**伺服应用 + API |
| Web 产物 | `apps/mobile/dist-real`（本次新构建） |
| 桩服务 | `qa-e2e/stub-api.mjs`（零依赖 Node，绑 `127.0.0.1:4200`） |
| 浏览器驱动 | `playwright-cli`（JS 入口 `qa-e2e/pw.js`）+ 系统 Chrome |
| Node | `C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe`（v22） |

---

## 2. 构建真实分支 Web 产物

命令（后台执行，约 2m46s）：

```bash
cd apps/mobile && EXPO_PUBLIC_USE_MOCK=false npx expo export --platform web --output-dir dist-real
```

关键输出（节选）：

```
Expo Autolinking module resolution enabled
Starting Metro Bundler
Web Bundled 92529ms apps\mobile\index.ts (722 modules)

› web bundles (1):
_expo/static/js/web/index-28c73301a83c94bbcb0da4236454b491.js (1.7MB)

› Files (3):
favicon.ico (15KB)
index.html (1.2KB)
metadata.json (49B)

Exported: dist-real
```

`dist-real/index.html` 生成确认：`<script src="/_expo/static/js/web/index-28c73301a83c94bbcb0da4236454b491.js" defer>`。

**真实分支佐证**：产物中上传抽屉**不含**「拍照」入口（Web `isSourceSupported('camera')===false`），**不含**「演示文件」分组（该分组由 `USE_MOCK` 控制，`AttachmentUploadSheet.tsx:225`）。运行时快照见 §5。

---

## 3. 桩服务 `qa-e2e/stub-api.mjs`

零依赖（busboy 从仓库内 `node_modules/.pnpm/node_modules/busboy` 经 `createRequire` 取，**未新增任何 npm 依赖**）。职责：

1. 静态伺服 `apps/mobile/dist-real`，**SPA 回退**（非 `/api` 未知路径 → `index.html`）；
2. 同源提供 `/api/v1/*` 桩接口；
3. **记录所有请求路径**到 stdout 与 `qa-e2e/.stub-requests.log`；
4. `POST /api/v1/attachments` 用 busboy 解析 multipart，证据落盘 `qa-e2e/.stub-uploads.json`。

已实现的桩路由（对齐 `AuthTokens` / `MeResponse` / `TaskDetail` / `Attachment` 类型 + 种子 `task-001` 形状）：

| 方法 | 路径 | 返回 |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | `{code:0,data:{accessToken,refreshToken}}` |
| GET | `/api/v1/auth/me` | `{code:0,data:{user,tenant,roles:['manager','member']}}` |
| GET | `/api/v1/tasks/:id` | `{code:0,data:TaskDetail}`（task/assignee/project/comments/attachments/timeEntries/dependencies） |
| GET | `/api/v1/tasks/audit` | `{code:0,data:[]}` |
| GET | `/api/v1/attachments?resource_type=&resource_id=` | `{code:0,data:[...]}` |
| POST | `/api/v1/attachments` | busboy 解析后 `{code:0,data:{id,resourceType,resourceId,objectKey,fileName,mimeType,sizeBytes,createdAt}}` |
| GET | `/api/v1/me/summaries` | 空 `PeriodSummary`（外壳渲染需要**对象**形状） |
| GET | `/api/v1/notifications/unread-count` | `0` |
| GET | `/api/v1/audit-logs` | `{items:[],total:0,page,pageSize}` |
| GET | 其它 `/api/v1/*` 兜底 | `{code:0,data:[]}` |
| 其它方法 | 其它 `/api/v1/*` 兜底 | `{code:0,data:{}}` |

启动命令（后台）：

```bash
CODEBUDDY_SAFE_DELETE_ENABLED=0 node qa-e2e/stub-api.mjs --port 4200
# [stub] busboy 已加载：.../node_modules/.pnpm/node_modules/busboy/package.json
# [stub] 监听 http://127.0.0.1:4200 | 静态目录=.../apps/mobile/dist-real
```

> 📌 **发现（非应用缺陷）**：任务说明列的 5 个端点不足以让应用外壳渲染。工作台首屏还会调用 `/me/summaries`、`/notifications/unread-count`、`/audit-logs`，且这些端点期望**对象**形状；若统一用兜底 `{data:[]}` 会导致 `WorkspaceScreen` 抛 `TypeError: Cannot read properties of undefined (reading 'length')`。补上对象形状桩后外壳正常。应用真实 API 面比任务书列出的更大。

---

## 4. 浏览器驱动 · 分步命令与证据

所有命令在 `qa-e2e/` 目录下执行（`node pw.js ...`，内部 `execFileSync(shell:false)` 直调 CLI，规避引号问题）。

### 4.1 打开桩源（系统 Chrome）

```bash
node pw.js --browser=chrome open "http://127.0.0.1:4200/"
```

```
### Page
- Page URL: http://127.0.0.1:4200/Login
- Page Title: Login
```

（未登录 → 自动落在 `/Login`。）

### 4.2 移动视口 + 登录

```bash
node pw.js resize 390 844
node pw.js click e46   # 「演示账号：zhangwei@example.com / openschedule（点击填入）」
node pw.js click e49   # 「登录」
```

登录后 `### Page - Page URL: http://127.0.0.1:4200/workspace`。桩日志（客户端真实请求）：

```
API POST /api/v1/auth/login | auth=no
API GET  /api/v1/auth/me    | auth=no
API GET  /api/v1/tasks?assigneeId=user-001&scope=my_todos | auth=yes
API GET  /api/v1/tasks?scope=deadline_approaching&timezone=Asia%2FShanghai | auth=yes
API GET  /api/v1/notifications/unread-count | auth=yes
API GET  /api/v1/me/summaries?period=week   | auth=yes
API GET  /api/v1/audit-logs?page=1&pageSize=5 | auth=yes
```

### 4.3 深链直达任务详情

```bash
node pw.js goto "http://127.0.0.1:4200/task/task-001"
```

```
API GET /api/v1/auth/me    | auth=yes
API GET /api/v1/tasks/task-001 | auth=yes   ← 真实分支 getTaskDetail 命中真实 HTTP
```

页面渲染 task-001 全量真实形状数据：标题「需求文档评审」、状态「待办」、优先级「高」、负责人「张伟」、起止「10月7日 → 10月7日」、截止「10月7日 18:00」、工时「4h / —」、标签「评审 · 需求」。

### 4.4 打开「添加附件」抽屉

```bash
node pw.js click f2e132   # 「添加附件」
node pw.js find "选择文件"
```

抽屉（dialog）**仅有两个入口**，证明真实分支：

```
- dialog [ref=f2e146]:
  - ...单文件 ≤20MB，支持图片 / PDF / Office 文档 / ZIP
  - button "从相册选择"
  - button "选择文件"
```

> 无「拍照」入口、无「演示文件」分组 ⇒ `EXPO_PUBLIC_USE_MOCK=false` 生效。

### 4.5 选择文件 → 触发 file chooser → 上传

```bash
node pw.js click f2e165   # 「选择文件」
# ### Modal state
# - [File chooser]: can be handled by upload

node pw.js upload "D:/GLMclaw/workspace/openschedule/qa-e2e/fixtures/qa-sample.pdf"
# ### Ran Playwright code
# await fileChooser.setFiles(["D:\\...\\qa-e2e\\fixtures\\qa-sample.pdf"])
```

**桩服务记录（断言 (a) 证据）**：

```
[2026-10-07T03:16:23.951Z] API POST /api/v1/attachments | auth=yes
[2026-10-07T03:16:23.969Z] POST /api/v1/attachments → 200 | boundary=true
  | textFields={"resource_type":"task","resource_id":"task-001"}
  | file={"field":"file","fileName":"qa-sample.pdf","mimeType":"application/pdf","encoding":"7bit","sizeBytes":218,"previewHead":"255044462d312e340a312030206f626a"}
  | 返回 id=att-stub-001
[2026-10-07T03:16:23.975Z] API GET /api/v1/tasks/task-001 | auth=yes   ← 上传成功后 refetch
```

`qa-e2e/.stub-uploads.json`（原始证据）：

```json
[
  {
    "at": "2026-10-07T03:16:23.953Z",
    "path": "/api/v1/attachments",
    "contentType": "multipart/form-data; boundary=----WebKitFormBoundaryKH8UgCZ8qyPDGYiZ",
    "contentLength": "620",
    "authorization": "Bearer stub.access.1791342821064",
    "textFields": { "resource_type": "task", "resource_id": "task-001" },
    "file": {
      "field": "file",
      "fileName": "qa-sample.pdf",
      "mimeType": "application/pdf",
      "encoding": "7bit",
      "sizeBytes": 218,
      "previewHead": "255044462d312e340a312030206f626a"
    },
    "attachment": {
      "id": "att-stub-001", "tenantId": "tenant-001",
      "resourceType": "task", "resourceId": "task-001",
      "objectKey": "tenant-001/task-001/qa-sample.pdf",
      "fileName": "qa-sample.pdf", "mimeType": "application/pdf",
      "sizeBytes": 218, "uploaderId": "user-001",
      "createdAt": "2026-10-07T03:16:23.967Z"
    },
    "hasBoundary": true
  }
]
```

**客户端侧请求证据**（`node pw.js request 7`）：

```
#7 [POST] http://127.0.0.1:4200/api/v1/attachments
  status:  [200] OK   type: fetch
  Request headers
    authorization: Bearer stub.access.1791342821064
    accept: application/json
    content-type: multipart/form-data; boundary=----WebKitFormBoundaryKH8UgCZ8qyPDGYiZ
```

> 🔴 **增量 11 最易踩的坑已验证**：请求头 `content-type` 为 `multipart/form-data` 且**自动带 boundary**（`----WebKitFormBoundaryKH8UgCZ8qyPDGYiZ`），说明 `client.ts:postMultipart` **未手动设置** Content-Type —— 与设计口径一致。

响应体（`node pw.js response-body 7`）：

```json
{"code":0,"data":{"id":"att-stub-001","resourceType":"task","resourceId":"task-001","objectKey":"tenant-001/task-001/qa-sample.pdf","fileName":"qa-sample.pdf","mimeType":"application/pdf","sizeBytes":218,"createdAt":"2026-10-07T03:16:23.967Z"},"message":"ok"}
```

### 4.6 UI 显示上传后的附件（断言 (b) 证据）

```bash
node pw.js find "qa-sample.pdf"
```

```
- generic [ref=f2e127]:
  - generic [ref=f2e128]:
    - generic [ref=f2e129]: 附件
    - generic [ref=f2e130]:
      - generic [ref=f2e131]: 1 个
      - button "添加附件" [ref=f2e132]
  - button "预览附件 qa-sample.pdf" [ref=f2e171]:
    - generic [ref=f2e174]: qa-sample.pdf
    - generic [ref=f2e175]: 218 B · 点击预览
```

截图存证：`qa-e2e/qa-e2e-evidence-task-detail.png`（附件区显示「1 个 / qa-sample.pdf / 218 B · 点击预览」）。

---

## 5. 断言汇总

| # | 断言 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 真实分支构建成功，产出 `dist-real/index.html` | ✅ PASS | §2 |
| 2 | 桩服务同源伺服应用 + API（SPA 回退） | ✅ PASS | §3、§4.1 |
| 3 | 登录走真实 `POST /auth/login` + `GET /auth/me` | ✅ PASS | §4.2 |
| 4 | 任务详情走真实 `GET /tasks/task-001` | ✅ PASS | §4.3 |
| 5 | 抽屉仅「相册 / 文件」入口（无拍照 / 无演示文件） | ✅ PASS | §4.4 |
| 6 | **(a)** 桩记录到**恰 1 次** multipart `POST /attachments`，含 3 字段（`file` / `resource_type` / `resource_id`） | ✅ PASS | §4.5 |
| 7 | 请求头 `content-type` 带 boundary（客户端未手写 Content-Type） | ✅ PASS | §4.5 |
| 8 | 解析出的 `resource_type=task`、`resource_id=task-001`、文件名/大小一致 | ✅ PASS | §4.5 |
| 9 | **(b)** UI 显示上传后附件（「1 个」+ 文件名 + 大小） | ✅ PASS | §4.6 |
| 10 | 上传成功后屏幕 refetch 任务详情 | ✅ PASS | §4.5 |

**失败项：0。**

---

## 6. 盲区与未覆盖项（如实）

1. **未覆盖 native（iOS/Android）路径**。本验证只跑 Web。native 分支走 `{uri,name,type}` 形态的 `FormData`（`task.service.ts:707-710`），需真机/模拟器才能验证；本次仅验证了 Web `File` 形态。
2. **桩服务不校验鉴权 / 租户 / RBAC**。任何 token 都被接受；因此验证的是**客户端接线**（token 注入、字段名、Content-Type、响应解包），**不是**后端策略。服务端可接收性预检（`precheckServerAcceptability`）与后端白名单放宽未在真实后端上验证。
3. **仅测了合法小文件（PDF 218B）**。未在真实分支端到端验证：>20MB 超限、非法 MIME、中文文件名。参考旁证：`qa-real-http` 的 `real-multipart-check` 已指出 busboy 默认 `latin1` 会把中文文件名解析成 mojibake（后端若未设 `defParamCharset=utf8` 需注意）—— 本桩服务亦沿用 busboy 默认行为，未做 utf8 修正。
4. **仅测了「选择文件」入口**（`document`）。「从相册选择」（`library`）未单独点击；两者最终都汇入同一 `startUpload`，故风险较低，但未逐一验证。
5. **未测失败/重试路径**。上传失败态（`phase==='error'`）与「重试」按钮未触发验证。
6. **桩服务 API 面是「到达目标链路所需的最小集」**。若继续点击其它页面/操作，可能仍需补桩路由；这不代表应用缺陷。
7. **网络证据取自 Playwright 的 `requests/request/response-body`**，非抓包工具；已交叉比对桩服务端日志，两侧一致。

---

## 7. 本次新增文件（均未改动 `apps/mobile/src/` 与 `services/`，未 `git commit`）

| 路径 | 说明 |
| --- | --- |
| `qa-e2e/stub-api.mjs` | 零依赖桩服务（静态伺服 + SPA 回退 + `/api/v1/*` 桩 + busboy multipart 解析 + 请求日志） |
| `qa-e2e/fixtures/qa-sample.pdf` | 上传用测试文件（218 B，合法 PDF 头） |
| `qa-e2e/qa-e2e-evidence-task-detail.png` | 附件上传成功后任务详情截图 |
| `qa-e2e/.stub-requests.log` | 桩服务全量请求日志（原始证据） |
| `qa-e2e/.stub-uploads.json` | multipart 解析证据（原始证据） |
| `apps/mobile/dist-real/**` | 真实分支 Web 构建产物（`expo export` 生成） |
| `docs/mobile-app/QA-mobile-increment-11-real-branch-e2e.md` | 本文档 |

> 复用（非本次新增）：`qa-e2e/pw.js`、`qa-e2e/playwright-cli.json`、`qa-e2e/real-multipart-check.mjs`（`qa-real-http` 产出）。

---

## 8. 复现步骤（TL;DR）

```bash
# 1) 构建真实分支
cd apps/mobile && EXPO_PUBLIC_USE_MOCK=false npx expo export --platform web --output-dir dist-real

# 2) 起桩服务（后台）
cd ../.. && CODEBUDDY_SAFE_DELETE_ENABLED=0 node qa-e2e/stub-api.mjs --port 4200

# 3) 驱动浏览器
cd qa-e2e
node pw.js --browser=chrome open "http://127.0.0.1:4200/"
node pw.js resize 390 844
node pw.js click <演示账号按钮>; node pw.js click <登录按钮>
node pw.js goto "http://127.0.0.1:4200/task/task-001"
node pw.js click <添加附件按钮>
node pw.js click <选择文件按钮>          # 触发 file chooser
node pw.js upload "$(pwd)/fixtures/qa-sample.pdf"
node pw.js find "qa-sample.pdf"          # 断言 UI 显示附件
```
