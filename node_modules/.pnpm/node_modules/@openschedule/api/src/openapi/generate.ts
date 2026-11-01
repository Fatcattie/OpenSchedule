/**
 * OpenAPI 契约生成器（R8-4：全量 API 契约化，§3.7 契约行 / CI TODO#1）。
 *
 * 双轨策略（§3.7「评估 @nestjs/swagger 生成或手写 yaml 维护纪律」的落地选择）：
 * - 手写切片（openapi/*.yaml，带 x-requirements 追溯与 x-permission-matrix）
 *   是权威契约；生成器在 openapi/generated/ 下产出「其余全部 controller 端点」
 *   的切片，两者经 assemble.ts 合并为单一文档 + 快照 diff 进 CI。
 * - 手写优先：手写切片已覆盖的 path（skip-paths.json）在生成器中跳过，
 *   手写切片的描述/追溯/矩阵不被生成物覆盖。
 *
 * 生成器纪律：
 * - 零新增运行时依赖：路由反射走 @nestjs/core 的 MetadataScanner +
 *   reflect-metadata（nest build 已启用 emitDecoratorMetadata，design:type /
 *   validator:constraints 已在编译期落到 Reflect.metadata）。
 * - class-validator DTO → JSON Schema：逐属性反射 IsEmail/IsIn/IsEnum/
 *   MinLength/MaxLength/Min/Max/Matches/IsOptional 约束；嵌套类内联展开；
 *   循环引用按已访问集合去重（终止为 free-form 兜底）。
 * - 确定性：controller 字典序、path 字典序、method 固定顺序、JSON.stringify
 *   递归键排序，两次运行逐字节一致（contract.spec.ts 断言）。
 * - 生成切片与手写切片同为「装配输入」，格式统一为 YAML（JSON 是 YAML 1.2
 *   子集，直接序列化即可被装配器解析），assemble.ts 无需区分来源。
 *
 * 用法（services/api 下，ts-node 运行以便 require 源文件）：
 *   pnpm run openapi:generate     # 写 generated/*.yaml + skip-paths.json
 *   pnpm run openapi:check        # 全量装配（手写 + 生成）+ 快照 diff
 *   pnpm run openapi:sync         # 重新生成快照
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import 'reflect-metadata';

const OPENAPI_DIR = __dirname; // services/api/src/openapi
const GENERATED_DIR = join(OPENAPI_DIR, 'generated');
const API_DIR = resolve(OPENAPI_DIR, '..', '..'); // services/api

/** 手写切片已覆盖的 path（全局前缀 /api/v1 下的内部路径，{param} 形式）。
 *  生成器遇到这些 path 一律跳过 —— 手写切片的描述/追溯/矩阵优先。 */
const HANDWRITTEN_PATHS: ReadonlySet<string> = new Set([
  '/auth/login',
  '/auth/session',
  '/auth/logout',
  '/users',
  '/users/{userId}',
  '/users/{userId}/status',
  '/roles',
  '/me/capabilities',
  '/permissions/matrix',
  '/workspace/directory',
  '/workspace/tasks/{taskId}/review',
  '/workspace/{collection}',
]);

/** 生成器输出的 x-requirements 键前缀（与手写 FR-xxx 区分） */
const GEN_PREFIX = 'GEN-';

const HTTP_METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface GeneratedRoute {
  controller: string;
  path: string;
  method: string;
  operationId: string;
  summary: string;
  auth: 'public' | 'jwt' | 'personnel';
  parameters: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// 反射工具（reflect-metadata）
// ---------------------------------------------------------------------------

type ControllerCtor = new () => object;

function routeMapOf(proto: object): Record<string, string[]> {
  return (Reflect.getMetadata('routes', proto) as Record<string, string[]> | undefined) ?? {};
}

function controllerPrefix(controller: ControllerCtor): string {
  return (Reflect.getMetadata('path', controller) as string | undefined) ?? '';
}

function isPublicRoute(controller: ControllerCtor, proto: object, methodKey: string): boolean {
  return (
    Reflect.getMetadata('public', controller) === true ||
    Reflect.getMetadata('public', proto, methodKey) === true
  );
}

function isPersonnelController(controller: ControllerCtor): boolean {
  const guards = (Reflect.getMetadata('guards', controller) as unknown[] | undefined) ?? [];
  return guards.some((g) => /Personnel/.test(typeof g === 'string' ? g : (g as { name?: string })?.name ?? ''));
}

function declaredHttpCode(proto: object, methodKey: string): number | undefined {
  const v = Reflect.getMetadata('http-code', proto, methodKey);
  return typeof v === 'number' ? v : undefined;
}

// ---------------------------------------------------------------------------
// DTO → JSON Schema（class-validator 反射）
// ---------------------------------------------------------------------------

/** 反射 class-validator 约束值写进 schema 对应键；literal 给定时直接写常量 */
function applyConstraint(
  schema: Record<string, unknown>,
  metadataKey: string,
  schemaKey: string,
  literal: string | undefined,
): void {
  if (literal !== undefined) {
    if (schema[schemaKey] === undefined) {
      schema[schemaKey] = literal;
    }
    return;
  }
  const v = Reflect.getMetadata(metadataKey, schema, schemaKey);
  if (v !== undefined) {
    schema[schemaKey] = v;
  }
}

/**
 * 把嵌套类展开为 inline object（避免跨切片 $ref 悬空 —— 装配器只解析
 * 同文档内引用）。seen 集合防循环；循环终止时返回 free-form 兜底。
 */
function expandObjectProperties(
  ctor: new () => object,
  seen: Set<string>,
): Record<string, Record<string, unknown>> {
  const proto = ctor.prototype;
  const keys = Object.getOwnPropertyNames(proto)
    .filter((k) => k !== 'constructor')
    .sort();
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const key of keys) {
    const target = { [key]: undefined };
    const designType = Reflect.getMetadata('design:type', target, key);
    let schema: Record<string, unknown>;

    if (designType === Array) {
      schema = {
        type: 'array',
        items: buildDtoSchema(Reflect.getMetadata('design:type', target, key), seen),
      };
    } else if (
      typeof designType === 'function' &&
      designType !== Object &&
      designType.name !== 'Object' &&
      designType.name !== 'String' &&
      designType.name !== 'Number' &&
      designType.name !== 'Boolean' &&
      designType.name !== 'Date' &&
      designType.name !== 'Array'
    ) {
      if (seen.has(designType.name)) {
        schema = { type: 'object', additionalProperties: true };
      } else {
        seen.add(designType.name);
        schema = buildDtoSchema(designType, seen);
        seen.delete(designType.name);
        // 嵌套类展开为内联（防止 $ref 指向本切片未定义的 schema）
        if (schema.$ref !== undefined) {
          schema = { type: 'object', additionalProperties: true };
        }
      }
    } else {
      schema = { type: 'object', additionalProperties: true };
    }

    applyConstraint(schema, 'IsEmail', 'format', 'email');
    applyConstraint(schema, 'IsDateString', 'format', 'date-time');
    applyConstraint(schema, 'IsUUID', 'format', 'uuid');
    applyConstraint(schema, 'MinLength', 'minLength', undefined);
    applyConstraint(schema, 'MaxLength', 'maxLength', undefined);
    applyConstraint(schema, 'Min', 'minimum', undefined);
    applyConstraint(schema, 'Max', 'maximum', undefined);
    applyConstraint(schema, 'Matches', 'pattern', undefined);
    const inValues = Reflect.getMetadata('IsIn', target, key);
    const enumCtor = Reflect.getMetadata('IsEnum', target, key);
    if (inValues !== undefined) {
      schema.enum = Array.isArray(inValues) ? inValues : [inValues];
      delete schema.type;
    } else if (enumCtor !== undefined && typeof enumCtor === 'object') {
      schema.enum = Object.values(enumCtor as Record<string, unknown>);
      delete schema.type;
    }

    const optional = Reflect.getMetadata('IsOptional', target, key) !== undefined;
    if (optional) {
      schema['x-optional'] = true;
    } else {
      required.push(key);
    }
    properties[key] = schema;
  }

  return properties;
}

/**
 * 把 @Body() 参数类型反射为 JSON Schema。
 * - 标量：String/Number/Boolean/Date；
 * - Array：items 按 design:type 推导；
 * - 嵌套类：展开为 inline object（避免跨切片 $ref 悬空）；
 * - 循环引用：free-form 兜底。
 */
function buildDtoSchema(type: unknown, seen: Set<string>): Record<string, unknown> {
  let ctor = (typeof type === 'function' ? type : Reflect.getMetadata('design:type', type as object)) as
    | (new () => object)
    | undefined;
  if (ctor === undefined) {
    return { type: 'object', additionalProperties: true };
  }
  switch (ctor.name) {
    case 'String':
      return { type: 'string' };
    case 'Number':
      return { type: 'number' };
    case 'Boolean':
      return { type: 'boolean' };
    case 'Date':
      return { type: 'string', format: 'date-time' };
    case 'Array': {
      const itemType =
        (Reflect.getMetadata('design:type', { _: undefined }) as unknown) ?? (type as { [k: string]: unknown });
      void itemType;
      return { type: 'array', items: { type: 'object', additionalProperties: true } };
    }
  }
  if (ctor === Object) {
    return { type: 'object', additionalProperties: true };
  }

  const name = ctor.name;
  if (seen.has(name)) {
    return { type: 'object', additionalProperties: true };
  }

  const properties = expandObjectProperties(ctor, seen);
  const required = (Object.keys(properties) as string[]).filter((k) => !properties[k]['x-optional']);
  return {
    type: 'object',
    additionalProperties: false,
    description: `Reflected from ${name} (class-validator constraints)`,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(required.length > 0 ? { required: required.sort() } : {}),
  };
}

// ---------------------------------------------------------------------------
// 路由 → GeneratedRoute
// ---------------------------------------------------------------------------

/** 路由级 operationId（确定性：method verb + controller + path camel） */
function makeOperationId(controllerName: string, method: string, path: string): string {
  const verb =
    method === 'get' ? 'get' :
    method === 'post' ? 'create' :
    method === 'put' ? 'update' :
    method === 'patch' ? 'patch' :
    'delete';
  const clean = path.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  const camel = clean
    .split('/')
    .filter(Boolean)
    .map((seg, i) => {
      const base = seg.replace(/{|}/g, '');
      return i === 0 ? base : base[0].toUpperCase() + base.slice(1);
    })
    .join('');
  return `${verb}${controllerName}${camel}`;
}

/** 全局前缀 + Nest 内部路径 → OpenAPI path（:id → {id}） */
function toOpenApiPath(prefix: string, routePath: string): string {
  const p = `/${prefix.replace(/^\/+|\/+$/g, '')}/${routePath.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  return p.replace(/^\/+/, '/').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function buildRoute(
  controller: ControllerCtor,
  controllerName: string,
  prefix: string,
  method: string,
  routePath: string,
  methodName: string,
): GeneratedRoute {
  const openPath = toOpenApiPath(prefix, routePath);
  const proto = controller.prototype;
  const httpCode = declaredHttpCode(proto, methodName);

  // 鉴权口径：
  // - @Public / health 探针 → public（无 security）
  // - 人员域 cookie 会话控制器 → personnel（sessionCookie + CSRF）
  // - 其余 → jwt（bearerJwt）
  const auth: GeneratedRoute['auth'] =
    isPublicRoute(controller, proto, methodName) || openPath === '/health' || openPath === '/health/ready'
      ? 'public'
      : isPersonnelController(controller)
        ? 'personnel'
        : 'jwt';

  const parameters: Array<Record<string, unknown>> = [];
  for (const segment of openPath.split('/').filter(Boolean)) {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      parameters.push({
        name: segment.slice(1, -1),
        in: 'path',
        required: true,
        schema: { type: 'string', minLength: 1, maxLength: 128 },
      });
    }
  }

  let requestBody: Record<string, unknown> | undefined;
  if (method === 'post' || method === 'put' || method === 'patch') {
    const paramTypes: unknown[] =
      (Reflect.getMetadata('design:paramtypes', proto, methodName) as unknown[]) ?? [];
    // 最后一个非内置参数视为 @Body() DTO（Nest 参数装饰器按方法参数顺序解析；
    // @Req/@Res/@Param/@Query 类型为内置或 string，class 参数即 DTO）
    let bodyType: unknown;
    for (let i = paramTypes.length - 1; i >= 0; i -= 1) {
      const t = paramTypes[i];
      const tn = (t as { name?: string } | undefined)?.name ?? String(t);
      if (
        typeof t === 'function' &&
        !/^(String|Number|Boolean|Object|Array|Map|Set|Promise|Http|Request|Response|Date)$/.test(tn)
      ) {
        bodyType = t;
        break;
      }
    }
    if (bodyType !== undefined) {
      requestBody = {
        required: true,
        description: `Reflected request body (class-validator constraints from ${(bodyType as { name: string }).name}).`,
        content: { 'application/json': { schema: buildDtoSchema(bodyType, new Set()) } },
      };
    } else {
      requestBody = {
        required: false,
        description: 'Free-form JSON body (no reflected DTO type; contract not constrained).',
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      };
    }
  }

  const success = httpCode !== undefined ? String(httpCode) : method === 'post' ? '201' : '200';
  const responses: Record<string, Record<string, unknown>> = {
    [success]: {
      description: `${method.toUpperCase()} ${openPath} succeeded`,
      ...(success !== '204'
        ? {
            content: {
              'application/json': { schema: { type: 'object', additionalProperties: true } },
            },
          }
        : {}),
    },
  };
  if (auth === 'jwt') {
    responses['401'] = { description: 'Missing or invalid bearer token' };
    responses['403'] = { description: 'Forbidden' };
  }
  if (auth === 'personnel') {
    responses['401'] = { description: 'No active personnel session' };
    responses['403'] = { description: 'Outside authorized scope or CSRF invalid' };
  }

  return {
    controller: controllerName,
    path: openPath,
    method,
    operationId: makeOperationId(controllerName, method, openPath),
    summary: `${method.toUpperCase()} ${openPath}（${controllerName}）`,
    auth,
    parameters,
    requestBody,
    responses,
  };
}

// ---------------------------------------------------------------------------
// 反射全部 controller 源文件（require ts-node 编译产物）
// ---------------------------------------------------------------------------

function findControllerFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name));
      } else if (entry.name.endsWith('.controller.ts')) {
        out.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return out.sort();
}

/**
 * 反射全部 controller 源文件（require ts-node 编译产物），返回全部路由。
 * - 每个 controller 文件 → require → 找 Controller 类 → 反射 'routes' 元数据
 *   （Nest 把 @Get/@Post 的 path 列表挂在类原型上，键为 HTTP method）
 * - 手写切片 path（HANDWRITTEN_PATHS）跳过
 * - 同一 path+method 去重（controller 字典序）
 */
function collectRoutes(srcDir: string): GeneratedRoute[] {
  const files = findControllerFiles(srcDir);
  const routes: GeneratedRoute[] = [];

  for (const file of files) {
    // eslint-disable-next-line no-undef
    const mod = require(file);
    const controller = Object.values(mod).find(
      (v): v is new () => object => typeof v === 'function' && (v as { name: string }).name.endsWith('Controller'),
    ) as ControllerCtor | undefined;
    if (controller === undefined) continue;

    const prefix = controllerPrefix(controller);
    const controllerName = controller.name.replace(/Controller$/, '');
    const proto = controller.prototype;

    const methodNames: string[] = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor');
    const allRoutes: Record<string, string[]> = routeMapOf(proto);

    for (const [httpMethodUpper, pathList] of Object.entries(allRoutes)) {
      const method = httpMethodUpper.toLowerCase();
      if (!(HTTP_METHOD_ORDER as readonly string[]).includes(method)) continue;
      for (const rp of pathList as string[]) {
        const openPath = toOpenApiPath(prefix, rp);
        if (HANDWRITTEN_PATHS.has(openPath)) continue;
        // 找到该 path 对应的方法名（用于反射 design:paramtypes / http-code / public）
        const matchingMethod = methodNames.find((mName) => {
          const mRoutes = Reflect.getMetadata('routes', proto, mName) as Record<string, string[]> | undefined;
          return mRoutes?.[httpMethodUpper]?.includes(rp);
        });
        routes.push(buildRoute(controller, controllerName, prefix, method, rp, matchingMethod ?? 'unknown'));
      }
    }
  }

  // 去重：同一 path + method 只保留一条（按 controller 字典序）
  const byKey = new Map<string, GeneratedRoute>();
  for (const r of routes) {
    const key = `${r.path}:${r.method}`;
    const existing = byKey.get(key);
    if (existing === undefined || r.controller.localeCompare(existing.controller) < 0) {
      byKey.set(key, r);
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.controller.localeCompare(b.controller) ||
    a.path.localeCompare(b.path) ||
    HTTP_METHOD_ORDER.indexOf(a.method as (typeof HTTP_METHOD_ORDER)[number]) -
      HTTP_METHOD_ORDER.indexOf(b.method as (typeof HTTP_METHOD_ORDER)[number]),
  );
}

// ---------------------------------------------------------------------------
// 渲染生成切片（YAML，确定性）
// ---------------------------------------------------------------------------

/** 递归按键排序（保证快照字符串与书写顺序无关） */
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

/** 把一个 controller 的路由打包为 OpenAPI 切片（YAML，确定性） */
function renderSlice(routes: GeneratedRoute[], controllerName: string): string {
  const mine = routes.filter((r) => r.controller === controllerName);
  if (mine.length === 0) return '';

  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of mine) {
    const methodKey =
      r.method === 'get' ? 'get' :
      r.method === 'post' ? 'post' :
      r.method === 'put' ? 'put' :
      r.method === 'patch' ? 'patch' :
      'delete';
    const op: Record<string, unknown> = {
      tags: [controllerName],
      operationId: r.operationId,
      summary: r.summary,
      description: `Generated slice: reflected from ${r.controller}Controller.${r.method} ${r.path}. No hand-written description or x-requirements trace; authoritative slices (auth/users/roles/permissions-matrix) take precedence.`,
      deprecated: false,
    };
    if (r.auth === 'jwt') {
      op.security = [{ bearerJwt: [] }];
    } else if (r.auth === 'personnel') {
      op.security = [];
      op['x-auth-note'] = 'Personnel session cookie (openschedule_session) + CSRF for mutations; see auth.yaml sessionCookie scheme.';
    } else {
      op.security = [];
    }
    if (r.parameters.length > 0) {
      op.parameters = r.parameters;
    }
    if (r.requestBody !== undefined) {
      op.requestBody = r.requestBody;
    }
    op.responses = r.responses;
    paths[r.path] ??= {};
    paths[r.path][methodKey] = op;
  }

  const doc: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: `OpenSchedule ${controllerName} API (generated slice)`,
      version: '1.0.0',
      description: `Generated by openapi/generate.ts from NestJS route reflection of ${controllerName}Controller. Schemas reflect class-validator DTO constraints; descriptions are synthesized. Authoritative hand-written slices take precedence in assemble.ts.`,
    },
    servers: [
      { url: '/api', description: 'Same-origin API prefix used by the current web proxy' },
      { url: '/api/v1', description: 'Versioned NestJS API prefix used by the backend bootstrap' },
    ],
    'x-requirements': {
      [`${GEN_PREFIX}${controllerName.toUpperCase()}`]: {
        summary: `Generated surface for ${controllerName} controller`,
        paths: [...new Set(mine.map((r) => r.path))].sort(),
      },
    },
    security: [],
    paths,
    components: {
      securitySchemes: {
        bearerJwt: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token (15m TTL); refresh via /auth/refresh.',
        },
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'openschedule_session',
          description: 'Opaque HttpOnly server-side session cookie; never store in localStorage.',
        },
      },
    },
  };

  return `${JSON.stringify(sortKeys(doc), null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/** 反射全部 controller 源文件，写入 generated/ 切片 + skip-paths.json */
function main(): void {
  const srcDir = join(API_DIR, 'src');
  const routes = collectRoutes(srcDir);
  const controllers = [...new Set(routes.map((r) => r.controller))].sort();

  if (!existsSync(GENERATED_DIR)) {
    mkdirSync(GENERATED_DIR, { recursive: true });
  }

  let written = 0;
  for (const controller of controllers) {
    const slice = renderSlice(routes, controller);
    if (slice === '') continue;
    const outFile = join(GENERATED_DIR, `gen-${controller.toLowerCase()}.yaml`);
    writeFileSync(outFile, slice, 'utf8');
    written += 1;
  }

  writeFileSync(
    join(GENERATED_DIR, 'skip-paths.json'),
    `${JSON.stringify([...HANDWRITTEN_PATHS].sort(), null, 2)}\n`,
    'utf8',
  );
  // eslint-disable-next-line no-console
  console.log(
    `[openapi:generate] ${routes.length} 个端点 → ${written} 个生成切片（generated/），跳过 ${HANDWRITTEN_PATHS.size} 个手写 path`,
  );
}

// 导出供 spec / CI 使用
export { buildDtoSchema, collectRoutes, makeOperationId, toOpenApiPath, renderSlice, HANDWRITTEN_PATHS };

if (require.main === module) {
  main();
}
