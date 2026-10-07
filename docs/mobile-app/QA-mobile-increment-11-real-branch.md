# QA 报告 · 增量 11 · 附件上传「真实分支」验证（尽力而为）

- **作者**：qa-real-http（QA 工程师）
- **日期**：2026-10-07
- **范围**：增量 11（任务附件拍照直传 M-P2-03）中 `EXPO_PUBLIC_USE_MOCK=false` 的**真实 HTTP 分支**
- **约束遵守**：未修改 `apps/mobile/src/**` 与 `services/**` 任何文件；零新增 npm 依赖；未执行 `git commit`。仅在 `qa-e2e/` 与 `docs/mobile-app/` 下新增文件。

---

## 0. 结论（TL;DR）

| 项 | 结果 |
|---|---|
| Phase A · 真实 HTTP multipart 往返（busboy 解析） | ✅ **12/12 断言通过**，退出码 0 |
| Phase C · `expo-image-picker` / `expo-document-picker` 声明 | ✅ 已声明且可解析（57.0.20 / 57.0.3） |
| Phase C · 原生适配层 native/web 一致性 | ✅ `attachmentPicker.ts` 与 `.web.ts` 导出**完全一致** |
| Phase C · `npx tsc --noEmit` | ✅ **退出码 0**（TypeScript 6.0.3） |
| Phase B/C · 真机 / 模拟器 / Expo Go | ❌ **本环境无设备，无法验证**（见 §5、§6） |
| 路由裁决 | **Send To: NoOne**（无源码缺陷；1 处为**测试自身断言错误**，已自查修复） |

**一句话**：真实分支的**请求构造 + boundary 自动附加 + 服务端 multipart 解析**这条链路在 Node 22 真实 HTTP 往返中**完整打通**；真机相关能力（HEIC 实拍、原生 FormData 的 `{uri,name,type}` 序列化、手势、生物识别、首屏性能）**在本环境不可验证**，已在 §6 给出可执行的补测清单。

---

## 1. 为什么需要这次验证（覆盖单测盲区）

现有单测 `apps/mobile/tests/attachment-multipart.test.ts` 用 **mock fetch** 验证了请求**形态**（URL、method、header 不含 `Content-Type`、body 是 FormData 实例、字段名序列）。它**无法**覆盖：

1. 真实 `FormData` 由运行时**自动序列化**并**自动附加 boundary**；
2. 真实 `Content-Type: multipart/form-data; boundary=...` 头是否被服务端正确接收；
3. 服务端 multipart 解析器能否从真实报文中**还原出全部字段与文件字节**。

本报告用「真实 `node:http` 服务 + 真实 `fetch`/`File`/`FormData` + 后端同族解析器 busboy」补齐上述三点。

---

## 2. Phase A · 真实 HTTP multipart 往返

### 2.1 被测链路（源码坐标，仅阅读未修改）

- `apps/mobile/src/services/config.ts:6` — `API_BASE = '/api/v1'`（相对路径）
- `apps/mobile/src/services/config.ts:12` — `USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK !== 'false'`
- `apps/mobile/src/services/task.service.ts:696` — `buildAttachmentFormData()`：append `file` / `resource_type` / `resource_id`
- `apps/mobile/src/services/task.service.ts:736` — `uploadAttachment()` 真实分支：`postMultipart('/attachments', form)`
- `apps/mobile/src/services/client.ts:179` — `postMultipart()`：headers 仅 `{ Accept, Authorization }`，**不设 `Content-Type`**

### 2.2 脚本

- 文件：`qa-e2e/real-multipart-check.mjs`（新增，零依赖）
- 解析器：**busboy@1.6.0**（multer 底层解析器，与真实 NestJS 后端同一解析器家族）
  - ⚠️ **偏差记录**：任务书给定的路径 `services/api/node_modules/busboy` 在本仓库**不存在**（`MODULE_NOT_FOUND`）。脚本按候选列表回退到 pnpm 实际落盘路径 `node_modules/.pnpm/busboy@1.6.0/node_modules/busboy` 并成功加载。**未使用降级解析器**（自写最小解析器仅在 busboy 完全不可用时才启用，本次未触发）。
- 客户端：Node 22 全局 `fetch` + 全局 `File`/`FormData`，字段与 headers **逐字复刻**应用真实分支。

### 2.3 复现命令

```bash
cd D:/GLMclaw/workspace/openschedule
C:/Users/Admin/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe qa-e2e/real-multipart-check.mjs
```

### 2.4 原始输出（逐字粘贴）

```
=== [1] 解析器加载 ===
  · D:\GLMclaw\workspace\openschedule\services\api\node_modules\busboy -> MODULE_NOT_FOUND
  · D:\GLMclaw\workspace\openschedule\node_modules\.pnpm\busboy@1.6.0\node_modules\busboy -> OK
  ✅ 使用 busboy：D:\GLMclaw\workspace\openschedule\node_modules\.pnpm\busboy@1.6.0\node_modules\busboy

=== [2] 本地服务 ===
  监听 http://127.0.0.1:53366（POST /api/v1/attachments）

=== [3] 真实 HTTP 往返 ===
  POST http://127.0.0.1:53366/api/v1/attachments
  请求头（应用侧）：{"Accept":"application/json","Authorization":"Bearer test-token"}  ← 注意：无 Content-Type
  发送文件：name=onsite-photo.heic mime=image/heic bytes=1024
  响应状态：200
  服务端收到 Content-Type：multipart/form-data; boundary=----formdata-undici-049874858016
  服务端收到 Content-Length：1399
  服务端收到 Authorization：Bearer test-token
  响应体：{"code":0,"data":{"fields":{"resource_type":"task","resource_id":"task-1"},"fileName":"onsite-photo.heic","sizeBytes":1024,"mimeType":"image/heic"}}

=== [4] 断言 ===
[PASS] HTTP 200 — status=200
[PASS] 服务端收到的 Content-Type 为 multipart/form-data 且**带 boundary** — multipart/form-data; boundary=----formdata-undici-049874858016
[PASS] boundary 非空且出现在 body 中（真实 FormData 序列化证据） — boundary 存在
[PASS] Authorization 头透传 — Bearer test-token
[PASS] Accept 头透传 — application/json
[PASS] 解析出全部 3 个字段（文本：resource_type / resource_id；文件：file） — textFields=["resource_id","resource_type"] file="onsite-photo.heic"
[PASS] resource_type === 'task' — got="task"
[PASS] resource_id === 'task-1' — got="task-1"
[PASS] 服务端解析出 file 文件名 === 发送值 — got="onsite-photo.heic"
[PASS] 服务端解析出 file 字节长度 === 发送值 — got=1024 expected=1024
[PASS] 服务端解析出 file mimeType === 发送值 — got="image/heic"
[PASS] 解析器类型 — busboy @ D:\GLMclaw\workspace\openschedule\node_modules\.pnpm\busboy@1.6.0\node_modules\busboy

=== [5] 补充探针（中文文件名，INFO 不计分）===
  发送文件名：现场照.heic
  busboy 默认字符集(latin1，对齐 multer) 解析得到："ç°åºç§.heic"
  是否与发送值逐字相等：否（潜在 mojibake —— 真实后端若未设 defParamCharset=utf8 需注意）

=== 汇总 ===
  12/12 通过，0 失败
  解析器：busboy
  退出码：0
```

> 说明：脚本每次运行监听随机空闲端口，故端口号（53366）逐次不同；boundary 由运行时随机生成（`----formdata-undici-*`）。

### 2.5 断言明细

| # | 断言 | 结果 | 证据 |
|---|---|---|---|
| 1 | HTTP 200 | PASS | `status=200` |
| 2 | 服务端收到 `multipart/form-data` 且**带 boundary** | PASS | `multipart/form-data; boundary=----formdata-undici-049874858016` |
| 3 | boundary 非空且 body 非空（真实序列化证据） | PASS | Content-Length=1399 |
| 4 | `Authorization` 透传 | PASS | `Bearer test-token` |
| 5 | `Accept` 透传 | PASS | `application/json` |
| 6 | 解析出全部 3 字段（2 文本 + 1 文件） | PASS | `textFields=["resource_id","resource_type"]` + `file="onsite-photo.heic"` |
| 7 | `resource_type === 'task'` | PASS | `"task"` |
| 8 | `resource_id === 'task-1'` | PASS | `"task-1"` |
| 9 | 服务端解析文件名 === 发送值 | PASS | `"onsite-photo.heic"` |
| 10 | 服务端解析字节长度 === 发送值 | PASS | `1024 === 1024` |
| 11 | 服务端解析 mimeType === 发送值 | PASS | `"image/heic"` |
| 12 | 解析器 = busboy（非降级） | PASS | 见 §2.2 路径 |

**关键结论**：`postMultipart` **不手设 `Content-Type`** 的策略在真实往返中被证明**正确** —— 运行时自动附加了含 boundary 的头，服务端 busboy 成功解析出全部字段与 1024 字节文件。这正面印证了 `client.ts:176` 注释所述「手设 `Content-Type` 会丢 boundary」的坑已被规避。

---

## 3. 测试自查修复记录（Round 1 → 路由：QA 自查）

首轮运行 11/12，唯一 FAIL 为**脚本自身断言错误**，非源码缺陷：

- 断言写成 `Object.keys(fields).length === 3`，但 busboy 把「文本字段」与「文件字段」分**不同事件**抛出 —— `fields` 只含 2 个文本字段，文件单独回显。这是**测试对解析器语义的误解**。
- **裁决**：断言错误 → 归 **QA 自查修复**（未上报 Engineer）。已改为「2 文本字段 + 1 文件字段」的等价断言，复跑 **12/12 通过**。
- 该记录本身即「`file` 字段与文本字段在 multipart 中属于不同 part 类型」的证据，对后端 DTO 解析理解有价值。

---

## 4. 发现与风险（非阻塞）

### 4.1 中文文件名潜在 mojibake（INFO，需真机/后端确认）

- 现象：客户端以 UTF-8 字节发送 `filename="现场照.heic"`；busboy 在**默认字符集（latin1，与 multer 默认一致）**下解析为 `ç°åºç§.heic`。
- 后端现状（只读核对）：`services/api/src/modules/attachments/attachments.controller.ts:18` 使用 `FileInterceptor('file', { limits: {...} })`，**未设置** `defParamCharset`。
- 影响面：若真实客户端（RN native）也以原始 UTF-8 字节发送文件名，后端 `file.originalname` 可能为 mojibake。**注意**：本脚本用的是 **undici（Node fetch）**，与 RN native 的 multipart 编码器**不同**，因此**本结论不能直接外推到移动端**。
- 建议：列为真机补测项（§6-③），用中文名图片在真机上传后核对后端存储的 `originalname`；若确认，再由后端/架构决策是否 `defParamCharset: 'utf8'`。
- **不作为源码缺陷上报**（未在真实客户端复现，且属后端既有行为，超出增量 11 前端范围）。

---

## 5. Phase C · 静态检查结果（原始输出）

### 5.1 依赖声明与可解析性

`apps/mobile/package.json`（节选，未修改）：

```json
"expo-document-picker": "~57.0.3",
"expo-image-picker": "~57.0.20",
```

解析实测：

```
expo-image-picker: D:\GLMclaw\workspace\openschedule\node_modules\.pnpm\expo-image-picker@57.0.20_expo@57.0.26\node_modules\expo-image-picker\package.json
expo-document-picker: D:\GLMclaw\workspace\openschedule\node_modules\.pnpm\expo-document-picker@57.0.3_expo@57.0.26\node_modules\expo-document-picker\package.json
```

`apps/mobile/app.json` 插件配置（节选）：

```json
["expo-image-picker", {
  "photosPermission": "用于从相册选择图片作为任务附件。",
  "cameraPermission": "用于拍摄照片作为任务附件。",
  "microphonePermission": false
}],
"expo-document-picker"
```

结论：✅ 两个 picker 均已声明、可解析、且已在 `app.json` 配置权限文案；`microphonePermission: false` 合理（拍照取图不需要麦克风）。

### 5.2 原生适配层一致性

两个文件均存在：`src/services/platform/attachmentPicker.ts`（native）、`src/services/platform/attachmentPicker.web.ts`（web）。

导出对比（`grep -nE "^export "` 原始输出）：

```
=== all export lines (native) ===
11:export type PickSource = 'camera' | 'library' | 'document'
14:export interface PickOptions {
22:export interface PickedFile {
33:export interface PickResult {
146:export function isSourceSupported(source: PickSource): boolean {
152:export async function pickFile(source: PickSource, options?: PickOptions): Promise<PickResult> {

=== all export lines (web) ===
15:export type PickSource = 'camera' | 'library' | 'document'
18:export interface PickOptions {
26:export interface PickedFile {
37:export interface PickResult {
152:export function isSourceSupported(source: PickSource): boolean {
157:export async function pickFile(source: PickSource, options?: PickOptions): Promise<PickResult> {
```

结论：✅ **导出符号、名称、签名完全一致**（`PickSource` / `PickOptions` / `PickedFile` / `PickResult` / `isSourceSupported` / `pickFile`）。实现差异为**有意为之**且已注释：native `isSourceSupported` 恒 `true`；web 排除 `camera`（`attachmentPicker.web.ts:152-154`）。

### 5.3 类型检查

```bash
cd D:/GLMclaw/workspace/openschedule/apps/mobile
npx tsc --noEmit
```

```
=== tsc --noEmit ===
TSC_EXIT=0
```

TypeScript 版本：`Version 6.0.3`。结论：✅ **退出码 0，无类型错误**。

---

## 6. 无法验证项及原因（本环境无设备）

| 能力 | 为何无法验证 | 谁能补上 |
|---|---|---|
| 真机拍照 → HEIC 实拍取图 | 无 iOS/Android 真机或模拟器；`expo-image-picker` 相机路径必须真机 | 有真机的人（见 §6 清单） |
| RN native FormData `{uri,name,type}` 的真实序列化 | Node 22 的 `FormData` 与 RN 的 polyfill 实现**不同**（本脚本只能验证 Web 语义分支） | 真机 + 抓包/后端日志 |
| 相册权限申请 / 拒绝 / 二次询问 | 需系统权限弹窗 | 真机 |
| 手势（抽屉/弹层/滚动） | 需触摸设备 | 真机 |
| 生物识别（`expo-local-authentication`） | 需 Secure Enclave / TEE 硬件 | 真机 |
| 首屏性能（冷启动、JS bundle 加载） | 需真机性能剖面 | 真机 |
| 中文文件名端到端 | 需真机 + 后端联调（§4.1） | 真机 + 后端 |

---

## 7. 真机补测清单（交给手上有真机的人）

> 目标：补齐 §6 的盲区。前置：Node 22 + 手机与电脑同一局域网。

**① 启动与扫码**
```bash
cd D:/GLMclaw/workspace/openschedule/apps/mobile
# 默认 mock（页面不白屏，先验证 UI 交互）
npx expo start
# 手机装 Expo Go，扫描终端二维码
```
如需接真实后端：把后端地址写入环境变量后重启（`API_BASE` 为相对路径，需由 Expo 的 `hostUri`/代理或 `EXPO_PUBLIC_*` 指向真实主机）：
```bash
EXPO_PUBLIC_USE_MOCK=false npx expo start --clear
```

**② 拍照直传**
1. 进入任一任务详情页 → 点「添加附件」→ 选「拍照」；
2. 首次会弹相机权限：分别验证 **允许 / 拒绝 / 拒绝后再次询问**；
3. 拍摄一张照片 → 确认进度条为**不确定态**（架构裁决 M5：真实分支不伪造百分比）；
4. 上传完成后确认列表出现该附件，文件名/大小正确。

**③ HEIC 与中文文件名**
1. iOS 用「设置 → 相机 → 格式 → 高效」拍 HEIC，重复②；
2. 从相册选一张**中文名**图片上传；
3. 核对后端返回/存储的 `originalname` 是否为原文（验证 §4.1 的 mojibake 风险）：
   ```bash
   # 后端日志或数据库附件表
   grep -i "originalname\|attachment" <后端日志路径>
   ```

**④ 手势与状态**
- 打开上传抽屉，验证下拉关闭、遮罩点击关闭、滚动不与父滚动冲突；
- 上传过程中切后台再回前台，确认状态不丢失/不重复提交。

**⑤ 生物识别**
- 触发需要生物识别的入口（如解锁），验证 Face ID / 指纹成功与失败分支。

**⑥ 首屏性能**
```bash
# 冷启动后记录 TTI / 首帧，建议用 Flipper / Xcode Instruments / Android Profiler
```
- 记录冷启动到首屏可交互耗时，与基线对比。

**⑦ 大文件与失败分支**
- 选 >20MB 文件，确认前端/后端均按上限拒绝并给中文提示；
- 飞行模式上传，确认提示「网络连接失败，请检查网络后重试」。

---

## 8. 交付物清单（新增文件）

| 路径 | 说明 |
|---|---|
| `qa-e2e/real-multipart-check.mjs` | Phase A 真实 HTTP multipart 往返验证脚本（零依赖，可重复运行） |
| `docs/mobile-app/QA-mobile-increment-11-real-branch.md` | 本报告 |

> 未改动：`apps/mobile/src/**`、`services/**`、`package.json`、`pnpm-lock.yaml`、`node_modules`。未执行 `git commit`。

---

## 9. 路由裁决

**Send To: NoOne**（全部验证项通过）。

- Round 1 唯一 FAIL 为**测试自身断言错误**，已由 QA 自查修复（§3），非源码缺陷。
- 无任何源码缺陷需 Engineer 修复。
- §4.1 中文文件名 mojibake 为**待真机确认的观察项**，不构成对增量 11 前端源码的缺陷上报。
- 剩余盲区（§6）**依赖真机硬件**，已转成可执行清单（§7）。
