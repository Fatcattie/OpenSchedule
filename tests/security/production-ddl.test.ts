'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const mainPath = path.join(ROOT, 'services', 'api', 'src', 'main.ts');
const migrationsPath = path.join(ROOT, 'services', 'api', 'prisma', 'migrations');
const packagePath = path.join(ROOT, 'services', 'api', 'package.json');

function read(filePath) {
  assert.ok(fs.existsSync(filePath), `契约文件不存在: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

function run() {
  const main = read(mainPath);
  const apiPackage = JSON.parse(read(packagePath));

  // FR-SEC-03：生产应用进程与 DDL 执行进程必须物理分离；即使是版本化 migrate
  // 也不能由 main.ts 在任意环境隐式触发。
  assert.doesNotMatch(main, /prisma\s+(db\s+push|migrate)/i, 'main.ts 不得包含任何隐式 Prisma DDL 命令');
  assert.doesNotMatch(main, /DB_AUTO_MIGRATE/, '应用启动路径不得拥有自动迁移开关');
  assert.ok(fs.existsSync(migrationsPath), '版本化迁移目录必须存在');
  const migrationFiles = fs.readdirSync(migrationsPath, { recursive: true }).filter((entry) => String(entry).endsWith('.sql'));
  assert.ok(migrationFiles.length > 0, '迁移目录必须至少包含一个 SQL migration');
  assert.equal(apiPackage.scripts['prisma:deploy'], 'prisma migrate deploy', 'DDL 唯一入口必须是 prisma migrate deploy');

  console.log('production-ddl: FR-SEC-03 contract assertions passed');
}

run();
