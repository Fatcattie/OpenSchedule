'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const guardPath = path.join(ROOT, 'services', 'api', 'src', 'common', 'startup', 'startup-guard.ts');
const mainPath = path.join(ROOT, 'services', 'api', 'src', 'main.ts');

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const guard = read(guardPath);
  const main = read(mainPath);
  const requiredNames = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'AI_SERVICE_TOKEN'];

  // FR-SEC-02：生产配置失败必须报告完整变量名集合，而不是只抛通用错误。
  for (const name of requiredNames) {
    assert.match(guard, new RegExp(`['"]${name}['"]`), `生产必需变量未纳入 fail-fast: ${name}`);
  }
  assert.match(guard, /failures\.push\([^\n]*name/, '缺失项必须把变量名写入失败集合');
  assert.match(guard, /logger\.error\([^\n]*failures\.join/, 'fail-fast 日志必须输出缺失变量名集合');
  assert.doesNotMatch(guard, /logger\.(error|warn|log)\([^\n]*value/, 'fail-fast 日志不得插值输出变量值');
  assert.doesNotMatch(guard, /logger\.(error|warn|log)\([^\n]*process\.env/, 'fail-fast 日志不得输出 process.env');

  // 空字符串、change-me 与 DB_AUTO_MIGRATE 都是不可绕过的边界。
  assert.match(guard, /\.trim\(\)/, '空白环境变量必须按缺失处理');
  assert.match(guard, /change-me/, '默认占位 secret 必须被拒绝');
  assert.match(guard, /DB_AUTO_MIGRATE/, '生产自动迁移开关必须进入启动阻断检查');
  assert.match(main, /checkProductionStartup\(/, '应用必须在生产启动路径调用统一 fail-fast 检查');
  assert.match(main, /process\.exit\(1\)/, 'fail-fast 失败必须以非零状态退出');

  console.log('startup-fail-fast: FR-SEC-02 contract assertions passed');
}

run();
