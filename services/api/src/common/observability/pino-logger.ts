/**
 * R9 结构化日志（pino）：统一 JSON 日志 + 敏感字段脱敏 + Nest LoggerService 适配。
 *
 * - `createPinoLogger(env, destination)`：可注入环境与输出流，便于单测断言（不落 stdout）。
 * - `obsLogger()`：进程级惰性单例（中间件 / Prisma 慢查询 / AppLogger 共用同一实例）。
 * - `AppLogger`：Nest `LoggerService` 适配，`NestFactory.create({ bufferLogs: true })` +
 *   `app.useLogger(app.get(AppLogger))` 后，框架日志（Bootstrap/路由/Nest 警告）也走 pino JSON。
 *
 * 脱敏：Authorization/Cookie 请求头与 password/token 等凭据字段一律 [REDACTED]（§3.3 凭据边界）。
 */
import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import pino from 'pino';
import { resolveAppEnv, resolveLogLevel, type LogLevel } from './observability-config';

/** DI 令牌（显式 token 注入，不依赖 emitDecoratorMetadata，esbuild 下亦可） */
export const PINO_LOGGER = 'OPENSHEDULE_PINO_LOGGER';

/** 敏感字段脱敏路径（pino redact 语法） */
export const REDACT_PATHS: readonly string[] = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
];

/** pino 日志级别 → Nest 日志级别（verbose 映射到 trace） */
const NEST_TO_PINO: Record<string, LogLevel> = {
  log: 'info',
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  debug: 'debug',
  verbose: 'trace',
};

/**
 * 创建 pino 实例。`destination` 用于测试捕获输出（缺省写 stdout，生产为逐行 JSON）。
 */
export function createPinoLogger(
  env: NodeJS.ProcessEnv = process.env,
  destination?: pino.DestinationStream,
): pino.Logger {
  const options: pino.LoggerOptions = {
    level: resolveLogLevel(env),
    base: { service: 'openschedule-api', env: resolveAppEnv(env) },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

let singleton: pino.Logger | undefined;

/** 进程级惰性单例（避免模块导入即产生副作用，便于单测） */
export function obsLogger(): pino.Logger {
  singleton ??= createPinoLogger(process.env);
  return singleton;
}

/** 测试用：替换/清空单例 */
export function setObsLogger(logger: pino.Logger | undefined): void {
  singleton = logger;
}

/**
 * Nest LoggerService → pino 适配。
 * Nest 调用形如 `logger.log(message, context)` / `logger.error(message, stack, context)`，
 * 末位字符串参数按 context 处理（与 @nestjs/common Logger 约定一致）。
 */
@Injectable()
export class AppLogger implements LoggerService {
  constructor(@Inject(PINO_LOGGER) private readonly logger: pino.Logger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  /** 供 Nest 覆盖级别（此处为无操作：级别由 LOG_LEVEL 环境变量决定） */
  setLogLevels(): void {
    /* 级别统一由 LOG_LEVEL 控制，Nest 运行时覆写不生效 */
  }

  private write(nestLevel: keyof typeof NEST_TO_PINO, message: unknown, params: unknown[]): void {
    // Nest 的 error(message, stack, context) 约定：末尾字符串为 context
    const context = typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const text = message instanceof Error ? message.message : String(message);
    const level = NEST_TO_PINO[nestLevel] ?? 'info';
    const meta: Record<string, unknown> = { event: 'nest_log' };
    if (context) meta.context = context;
    const extra = params.filter((p) => p !== undefined && p !== null);
    if (extra.length > 0) meta.params = extra;
    if (message instanceof Error && message.stack) meta.stack = message.stack;
    this.logger[level](meta, text);
  }
}
