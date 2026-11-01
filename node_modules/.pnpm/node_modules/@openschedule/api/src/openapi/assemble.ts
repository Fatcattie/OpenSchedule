/**
 * OpenAPI 契约装配器（R8-4，设计文档 §4.5「API 契约」/ CI TODO#1，ADR D-14）。
 *
 * src/openapi/*.yaml 切片是前端↔后端绑定契约的唯一正本（含 x-requirements
 * 需求追溯与 x-permission-matrix 机器可读权限矩阵）。本模块把切片合并为
 * 单一文档并做结构校验，产物与已提交的 openapi.snapshot.json 做 diff：
 * 任何契约改动都会让 contract.spec.ts / `openapi:check` 失败，必须显式
 * `openapi:sync` 更新快照才算认账。
 *
 * 合并规则（确定性，与切片书写顺序无关）：
 * - openapi/version/servers/security：各切片必须一致（servers 按 url 去重）
 * - info：合成（标题固定，附 x-slices 来源清单），不复制各切片描述
 * - paths / components / x-permission-matrix：按键合并；契约判等（忽略 description）
 *   一致的重复声明去重（切片自足），结构/约束不一致即报错
 * - x-requirements：同 FR 的 paths 取排序并集；summary 取文件名字典序首个
 * - 顶层键白名单：出现未知键即报错（新增扩展字段必须显式认账）
 *
 * 结构校验（装配即执行，失败抛 ContractAssemblyError）：
 * - operationId 全文档唯一
 * - 所有 `#/...` $ref 可在装配文档内解析（无悬空引用）
 * - x-requirements 声明的 paths 必须真实存在于 paths
 *
 * 用法：
 *   pnpm --filter "./services/api" run openapi:sync    # 重新生成快照
 *   pnpm --filter "./services/api" run openapi:check  # 校验 + diff（CI 用）
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

/** 快照文件名（不参与装配，避免自引用） */
export const SNAPSHOT_FILENAME = 'openapi.snapshot.json';

/** 装配文档顶层键白名单（未知键报错，防止扩展字段静默丢失） */
const TOP_LEVEL_KEYS = new Set([
  'openapi',
  'info',
  'servers',
  'security',
  'paths',
  'components',
  'x-requirements',
  'x-permission-matrix',
]);

export class ContractAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractAssemblyError';
  }
}

function fail(message: string): never {
  throw new ContractAssemblyError(message);
}

/** 递归剥离 `description` 字段（JSON Schema 中文档性内容，不参与契约判等） */
function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptions);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'description') continue;
      out[key] = stripDescriptions(v);
    }
    return out;
  }
  return value;
}

/**
 * 契约判等：忽略 description 后的深比较。
 * 切片自足声明同一节点时允许文档措辞漂移（首个定义生效），
 * 结构/约束（type、enum、required、format……）任何不一致都必须显式报错。
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(sortKeys(stripDescriptions(a))) ===
    JSON.stringify(sortKeys(stripDescriptions(b)))
  );
}

/** 递归按键排序，保证快照字符串与切片书写顺序无关 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

interface Slice {
  /** 来源文件名（不含目录），用于报错定位 */
  file: string;
  doc: Record<string, unknown>;
}

/** 读取 openapiDir 下全部切片（文件名字典序，确定性） */
export function loadSlices(openapiDir: string): Slice[] {
  const files = readdirSync(openapiDir)
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  if (files.length === 0) {
    fail(`openapi 目录没有切片：${openapiDir}`);
  }
  return files.map((file) => {
    const raw = readFileSync(resolve(openapiDir, file), 'utf8');
    const doc = parseYaml(raw);
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      fail(`${file}：顶层必须是 YAML 对象`);
    }
    return { file, doc: doc as Record<string, unknown> };
  });
}

/**
 * 合并两个 map 型节点：契约判等（忽略 description）一致的重复声明去重，
 * 结构/约束不一致的键冲突报错。
 */
function mergeMap(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  label: string,
  file: string,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (key in target) {
      if (deepEqual(target[key], value)) continue; // 切片自足声明的同一节点，去重
      fail(`${file}：${label} 键冲突「${key}」（与更早切片的结构/约束不一致）`);
    }
    target[key] = value;
  }
}

/** x-requirements 合并：paths 排序并集；summary 取首个；其余字段冲突报错 */
function mergeRequirements(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  file: string,
): void {
  for (const [fr, raw] of Object.entries(source)) {
    const incoming = raw as Record<string, unknown>;
    if (!(fr in target)) {
      target[fr] = {
        ...incoming,
        paths: [...new Set(incoming.paths as string[])].sort(),
      };
      continue;
    }
    const existing = target[fr] as Record<string, unknown>;
    const existingPaths = new Set(existing.paths as string[]);
    for (const p of incoming.paths as string[]) {
      existingPaths.add(p);
    }
    existing.paths = [...existingPaths].sort();
    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'paths') continue;
      if (key === 'summary') continue; // 各切片措辞可不同，取文件名字典序首个
      if (deepEqual(existing[key], value)) continue;
      fail(`${file}：x-requirements.${fr}.${key} 冲突（已由更早切片定义）`);
    }
  }
}

/** 装配 + 结构校验；openapiDir 为 src/openapi 目录 */
export function assembleContract(openapiDir: string): Record<string, unknown> {
  const slices = loadSlices(openapiDir);
  const doc: Record<string, unknown> = {
    openapi: undefined,
    info: undefined,
    servers: [],
    security: [],
    paths: {},
    components: {},
    'x-requirements': {},
    'x-permission-matrix': undefined,
  };
  const paths: Record<string, unknown> = {};
  const components: Record<string, unknown> = {};
  const requirements: Record<string, unknown> = {};
  const permissionMatrix: Record<string, unknown> = {};
  const serversByUrl = new Map<string, unknown>();
  const infoVersions = new Set<string>();

  for (const { file, doc: slice } of slices) {
    for (const key of Object.keys(slice)) {
      if (!TOP_LEVEL_KEYS.has(key)) {
        fail(`${file}：未知顶层键「${key}」（如为新扩展字段，先更新 assemble.ts 白名单）`);
      }
    }

    if (slice.openapi !== '3.1.0') {
      fail(`${file}：openapi 版本必须是 3.1.0，实际 ${JSON.stringify(slice.openapi)}`);
    }
    doc.openapi = slice.openapi;

    const info = slice.info as Record<string, unknown> | undefined;
    infoVersions.add(String(info?.version ?? ''));

    for (const server of slice.servers as Array<Record<string, unknown>>) {
      serversByUrl.set(String(server.url), server);
    }

    if (!deepEqual(slice.security, [])) {
      fail(`${file}：切片级 security 必须是 []（全局安全声明按 operation 配置）`);
    }

    mergeMap(paths, slice.paths as Record<string, unknown>, 'paths', file);
    const sliceComponents = (slice.components ?? {}) as Record<string, unknown>;
    for (const [section, entries] of Object.entries(sliceComponents)) {
      if (!(section in components)) {
        components[section] = {};
      }
      mergeMap(
        components[section] as Record<string, unknown>,
        entries as Record<string, unknown>,
        `components.${section}`,
        file,
      );
    }
    if (slice['x-requirements']) {
      mergeRequirements(requirements, slice['x-requirements'] as Record<string, unknown>, file);
    }
    if (slice['x-permission-matrix']) {
      mergeMap(
        permissionMatrix,
        slice['x-permission-matrix'] as Record<string, unknown>,
        'x-permission-matrix',
        file,
      );
    }
  }

  if (infoVersions.size !== 1) {
    fail(`切片 info.version 不一致：${[...infoVersions].join(', ')}`);
  }

  doc.openapi = '3.1.0';
  doc.info = {
    title: 'OpenSchedule API (assembled contract)',
    version: [...infoVersions][0],
    description:
      'Assembled from per-route contract slices under services/api/src/openapi/. ' +
      'Snapshot diff is a CI gate: run `openapi:sync` to acknowledge intentional changes.',
    'x-slices': slices.map((s) => s.file),
  };
  doc.servers = [...serversByUrl.values()].sort((a, b) =>
    String((a as Record<string, unknown>).url).localeCompare(
      String((b as Record<string, unknown>).url),
    ),
  );
  doc.security = [];
  doc.paths = paths;
  doc.components = components;
  doc['x-requirements'] = requirements;
  if (Object.keys(permissionMatrix).length > 0) {
    doc['x-permission-matrix'] = permissionMatrix;
  } else {
    delete doc['x-permission-matrix'];
  }

  validateContract(doc);
  return doc;
}

/** 解析 `#/a/b` 形式的本地 $ref（支持 ~0 ~1 转义） */
function resolvePointer(doc: Record<string, unknown>, ref: string): unknown {
  const segments = ref
    .slice(2)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = doc;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** 结构校验：operationId 唯一、$ref 可解析、x-requirements 路径闭包 */
function validateContract(doc: Record<string, unknown>): void {
  const paths = doc.paths as Record<string, unknown>;

  const operationIds = new Map<string, string>();
  for (const [path, rawMethods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(rawMethods as Record<string, unknown>)) {
      const operationId = (op as Record<string, unknown>).operationId;
      if (typeof operationId !== 'string') continue;
      if (operationIds.has(operationId)) {
        fail(`operationId 重复「${operationId}」：${operationIds.get(operationId)} 与 ${path}.${method}`);
      }
      operationIds.set(operationId, `${path}.${method}`);
    }
  }

  const dangling: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === '$ref' && typeof v === 'string' && v.startsWith('#/')) {
          if (resolvePointer(doc, v) === undefined) {
            dangling.push(v);
          }
        } else {
          walk(v);
        }
      }
    }
  };
  walk(doc);
  if (dangling.length > 0) {
    fail(`悬空 $ref（在装配文档内不可解析）：${[...new Set(dangling)].join(', ')}`);
  }

  const requirements = doc['x-requirements'] as Record<string, unknown>;
  const unknownPaths: string[] = [];
  for (const [fr, raw] of Object.entries(requirements)) {
    for (const p of (raw as Record<string, unknown>).paths as string[]) {
      if (!(p in paths)) {
        unknownPaths.push(`${fr} → ${p}`);
      }
    }
  }
  if (unknownPaths.length > 0) {
    fail(`x-requirements 声明了不存在的 path：${unknownPaths.join(', ')}`);
  }
}

/** 快照序列化：键递归排序 + 2 空格缩进，输出与切片书写顺序无关 */
export function renderSnapshot(doc: Record<string, unknown>): string {
  return `${JSON.stringify(sortKeys(doc), null, 2)}\n`;
}

/** 供 contract.spec.ts 使用：装配并渲染 */
export function buildSnapshot(openapiDir: string): string {
  return renderSnapshot(assembleContract(openapiDir));
}

/** CLI：默认 check（diff 失败 exit 1）；--write 重新生成快照 */
function main(): void {
  const dir = __dirname;
  const snapshot = buildSnapshot(dir);
  const snapshotPath = resolve(dir, SNAPSHOT_FILENAME);
  const write = process.argv.includes('--write');
  if (write) {
    writeFileSync(snapshotPath, snapshot, 'utf8');
    console.log(`[openapi] 快照已更新：${snapshotPath}（${snapshot.length} bytes）`);
    return;
  }
  let committed: string;
  try {
    committed = readFileSync(snapshotPath, 'utf8');
  } catch {
    console.error(`[openapi] 缺少快照 ${snapshotPath}；请先运行 openapi:sync 生成基线`);
    process.exit(1);
  }
  if (committed !== snapshot) {
    console.error(
      '[openapi] 契约快照漂移：src/openapi/*.yaml 的改动未同步快照。\n' +
        '如为有意变更，运行 pnpm --filter "./services/api" run openapi:sync 后随代码一起提交。',
    );
    process.exit(1);
  }
  console.log('[openapi] 契约快照一致 ✓');
}

if (require.main === module) {
  main();
}
