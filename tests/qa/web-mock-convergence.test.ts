'use strict';

/**
 * R8 USE_MOCK 双分支收敛门禁（本地/发布前；与 tests/qa/* 其它门禁同构，静态断言源码契约）。
 *
 * 收敛目标：`apps/web/src/api/**` 的请求层只保留「真实路径」，mock 判定收敛到唯一入口
 * （`src/api/mock/dispatch.ts`）。断言：
 *  1. `src/api/**`（除 `config.ts` 定义处与 `mock/` 目录）不得出现 `USE_MOCK`；
 *  2. 不得直接 `getMockHandlers`（只有 dispatch 可懒加载 fixtures）；
 *  3. `src/api/**` 不持有演示数据（fixtures 只在 `src/__fixtures__/`）；
 *  4. 收敛后调用方使用 mockOr / mockOrValue / mockOrMap / mockOrVoid，且处理器名受类型约束；
 *  5. 全应用 `USE_MOCK` 仍只有一处定义（`@/api/config`），hooks/pages 的 dev-only 分支不各自判定环境变量。
 * 断言只读源码文本，不启动进程、不依赖网络。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const WEB = path.join(ROOT, 'apps', 'web');
const API = path.join(WEB, 'src', 'api');
const SRC = path.join(WEB, 'src');

function walk(dir, filter = () => true) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

/** 去掉注释后再做语法层面的字符串检查（注释里提到 USE_MOCK 不算分支） */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, ' ');
}

function run() {
  const apiFiles = walk(API, (p) => /\.tsx?$/.test(p));

  // ---- 1. 请求层不得再出现 USE_MOCK（唯一判定点在 mock/dispatch.ts）----
  const offenders = [];
  for (const file of apiFiles) {
    const relative = rel(file);
    if (relative.endsWith('src/api/config.ts')) continue; // 定义处
    if (relative.includes('src/api/mock/')) continue; // 判定处
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    text.split('\n').forEach((line, i) => {
      if (line.includes('USE_MOCK')) offenders.push(`${relative}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `src/api 请求层不得出现 USE_MOCK（应收敛到 mock/dispatch.ts）：\n${offenders.join('\n')}`);

  // ---- 2. 只有 dispatch 可懒加载 fixtures ----
  const isMockDir = (f) => rel(f).startsWith('apps/web/src/api/mock/');
  const loaderUsers = apiFiles
    .filter((f) => !isMockDir(f))
    .filter((f) => fs.readFileSync(f, 'utf8').includes('getMockHandlers'));
  assert.deepEqual(
    loaderUsers.map(rel),
    [],
    'api 模块不得直接调用 getMockHandlers（必须经 mock/dispatch）',
  );
  const dispatch = fs.readFileSync(path.join(API, 'mock', 'dispatch.ts'), 'utf8');
  assert.match(dispatch, /^import \{ USE_MOCK \} from '\.\.\/config'$/m, 'dispatch 必须从 config 读取唯一开关');
  assert.match(dispatch, /getMockHandlers/, 'dispatch 是唯一的 fixtures 懒加载点');
  for (const helper of ['mockOr', 'mockOrValue', 'mockOrMap', 'mockOrVoid']) {
    assert.match(dispatch, new RegExp(`export (async )?function ${helper}\\b`), `dispatch 缺少收敛入口: ${helper}`);
  }
  // 处理器名类型约束（拼错/删除处理器 → typecheck 失败）
  assert.match(dispatch, /keyof MockHandlers/, '处理器名必须由 fixtures 类型约束');

  // ---- 3. 请求层不持有演示数据 ----
  const dataInApi = apiFiles
    .filter((f) => !isMockDir(f))
    .filter((f) => fs.readFileSync(f, 'utf8').includes('__fixtures__'));
  assert.deepEqual(dataInApi.map(rel), [], 'src/api 不得引用 __fixtures__（演示数据只在 fixtures 目录）');

  // ---- 4. 调用方确实在使用收敛入口 ----
  const allApiText = apiFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.ok((allApiText.match(/mockOr\(/g) || []).length >= 60, '绝大多数请求函数应经 mockOr 收敛');
  assert.ok(/mockOrValue\(/.test(allApiText), '字面量分支应经 mockOrValue 收敛');
  assert.ok(/mockOrMap\(/.test(allApiText), '需二次加工的分支应经 mockOrMap 收敛');
  assert.ok(/mockOrVoid\(/.test(allApiText), '副作用分支应经 mockOrVoid 收敛');

  // ---- 5. 全应用只有一处 USE_MOCK 定义（hooks/pages 不各自读环境变量）----
  const definesUseMock = walk(SRC, (p) => /\.tsx?$/.test(p)).filter((f) =>
    /export const USE_MOCK\b/.test(fs.readFileSync(f, 'utf8')),
  );
  assert.deepEqual(definesUseMock.map(rel), ['apps/web/src/api/config.ts'], 'USE_MOCK 只能在 @/api/config 定义');
  const rawEnvReaders = walk(SRC, (p) => /\.tsx?$/.test(p)).filter(
    (f) =>
      rel(f) !== 'apps/web/src/api/config.ts' &&
      stripComments(fs.readFileSync(f, 'utf8')).includes('import.meta.env.VITE_USE_MOCK'),
  );
  assert.deepEqual(rawEnvReaders.map(rel), [], '除 config.ts 外不得直接读 import.meta.env.VITE_USE_MOCK');

  console.log('web-mock-convergence: USE_MOCK 双分支收敛契约断言通过（请求层 0 处 USE_MOCK）');
}

run();
