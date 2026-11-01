'use strict';

/**
 * QA 门禁：统一错误信封 + HTTP 状态码契约（R8 收尾）。
 * 运行：node --experimental-strip-types tests/qa/api-error-envelope.test.ts
 *
 * 覆盖三点：
 *  1. 运行时错误信封 {code,message,details,traceId,requestId} 与 OpenAPI 快照 ErrorBody 逐字段一致（防漂移）；
 *  2. 错误过滤器不把 SQL/secret/堆栈回传给客户端；
 *  3. POST 成功响应状态码契约：无 @HttpCode 覆盖时 NestJS POST 默认 201，快照不得声明 200。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const filterPath = path.join(ROOT, 'services', 'api', 'src', 'common', 'filters', 'http-exception.filter.ts');
const controllerPath = path.join(ROOT, 'services', 'api', 'src', 'modules', 'proposals', 'proposals.controller.ts');
const snapshotPath = path.join(ROOT, 'services', 'api', 'src', 'openapi', 'openapi.snapshot.json');

/** 运行时错误信封字段（权威顺序取自 http-exception.filter.ts 的 res.json({...})） */
const ENVELOPE_FIELDS = ['code', 'message', 'details', 'traceId', 'requestId'];

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `API 契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const filter = read(filterPath);
  const controller = read(controllerPath);
  const snapshot = JSON.parse(read(snapshotPath));

  // API 契约：错误结构稳定、可定位但不把 SQL/secret/堆栈回传给客户端。
  for (const field of ENVELOPE_FIELDS) {
    assert.match(filter, new RegExp(field), `统一错误信封缺少 ${field}`);
  }
  assert.match(
    filter,
    /json\(\{\s*code,\s*message,\s*details,\s*traceId,\s*requestId\s*\}\)/,
    '错误过滤器必须以 {code,message,details,traceId,requestId} 信封写响应（运行时形状即契约）',
  );
  assert.doesNotMatch(filter, /password|token|secret|DATABASE_URL/i, '错误过滤器不得把敏感字段拼入响应');
  assert.match(filter, /401|403|404|409|422|500|503/, '错误过滤器必须覆盖认证、授权、资源和服务失败类别');

  // 快照 ↔ 运行时：ErrorBody 必填字段必须与过滤器实际写出的字段逐一相等（含 details 的自由形状语义）。
  const errorBody = snapshot.components && snapshot.components.schemas && snapshot.components.schemas.ErrorBody;
  assert.ok(errorBody, 'OpenAPI 快照必须定义 components.schemas.ErrorBody（统一错误信封）');
  assert.deepEqual(
    [...(errorBody.required || [])].sort(),
    [...ENVELOPE_FIELDS].sort(),
    'ErrorBody.required 必须与运行时错误信封字段完全一致',
  );
  assert.equal(errorBody.additionalProperties, false, '错误信封必须闭合（additionalProperties: false）');
  assert.equal(
    errorBody.properties && errorBody.properties.details && errorBody.properties.details.type,
    undefined,
    'details 必须保持自由形状（校验错误为数组、业务错误为对象键），不得锁定为 object',
  );
  assert.ok(
    errorBody.properties && errorBody.properties.code && errorBody.properties.code.minimum === 400,
    'ErrorBody.code 必须声明分段业务错误码下界（>= 400）',
  );

  // HTTP 状态码契约：本契约切片未使用 @HttpCode 覆盖，NestJS POST 默认 201。
  // 若将来确有 POST 需要 200，必须同时改控制器（@HttpCode）、yaml 与本断言（显式留痕）。
  const postDrift = [];
  for (const [route, ops] of Object.entries(snapshot.paths || {})) {
    const post = ops && ops.post;
    if (!post) continue;
    const success = Object.keys(post.responses || {}).filter(status => /^2\d\d$/.test(status));
    if (success.length !== 1 || success[0] !== '201') {
      postDrift.push(`${route} → ${success.length ? success.join(',') : '无 2xx'}`);
    }
  }
  assert.deepEqual(postDrift, [], `POST 成功响应必须为 201（发现漂移）: ${postDrift.join('; ')}`);

  // 新模型 API 绑定 architecture contract：资源路由存在、DTO 不可写 tenantId。
  // 契约草案名 ai-proposal-tasks 最终落地为 proposals 模块（AI 拆解提议 → 审批门 apply/reject）。
  assert.match(controller, /@Get\('proposals'\)/, '新模型 controller 必须暴露 /proposals 资源路由（路径稳定）');
  assert.match(controller, /@Post\('proposals\/:id\/apply'\)/, '新模型 controller 必须暴露审批 apply 动作（AI 提议审批门）');
  assert.doesNotMatch(controller, /@Body\([^)]*\).*tenantId|tenantId\s*:/, '新模型 API 不得接受客户端写入 tenantId');

  console.log('api-error-envelope: architecture API contract assertions passed');
}

run();
