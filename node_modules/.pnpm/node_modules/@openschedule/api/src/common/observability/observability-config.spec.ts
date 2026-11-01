/**
 * R9 可观测性配置解析：非法/缺失值必须回落默认，未知日志级别回落 info。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_SLOW_QUERY_MS,
  parsePositiveInt,
  resolveAppEnv,
  resolveLogLevel,
  resolveMetricsEnabled,
  resolveSlowQueryMs,
} from './observability-config';

describe('observability-config', () => {
  it('parsePositiveInt：非法/缺失回落 fallback，且不小于 min', () => {
    expect(parsePositiveInt(undefined, 7)).toBe(7);
    expect(parsePositiveInt('', 7)).toBe(7);
    expect(parsePositiveInt('abc', 7)).toBe(7);
    expect(parsePositiveInt('1.5', 7)).toBe(7);
    expect(parsePositiveInt('-3', 7)).toBe(7);
    expect(parsePositiveInt('0', 7, 1)).toBe(7);
    expect(parsePositiveInt('0', 7, 0)).toBe(0);
    expect(parsePositiveInt('42', 7)).toBe(42);
  });

  it('resolveLogLevel：大小写不敏感，未知值回落 info', () => {
    expect(resolveLogLevel({ LOG_LEVEL: 'WARN' })).toBe('warn');
    expect(resolveLogLevel({ LOG_LEVEL: ' trace ' })).toBe('trace');
    expect(resolveLogLevel({ LOG_LEVEL: 'silly' })).toBe(DEFAULT_LOG_LEVEL);
    expect(resolveLogLevel({})).toBe(DEFAULT_LOG_LEVEL);
  });

  it('resolveSlowQueryMs：默认 200，正整数生效', () => {
    expect(resolveSlowQueryMs({})).toBe(DEFAULT_SLOW_QUERY_MS);
    expect(resolveSlowQueryMs({ SLOW_QUERY_MS: '50' })).toBe(50);
    expect(resolveSlowQueryMs({ SLOW_QUERY_MS: 'oops' })).toBe(DEFAULT_SLOW_QUERY_MS);
  });

  it('resolveMetricsEnabled：仅显式 false/0/off 关闭', () => {
    expect(resolveMetricsEnabled({})).toBe(true);
    expect(resolveMetricsEnabled({ METRICS_ENABLED: 'true' })).toBe(true);
    expect(resolveMetricsEnabled({ METRICS_ENABLED: 'FALSE' })).toBe(false);
    expect(resolveMetricsEnabled({ METRICS_ENABLED: '0' })).toBe(false);
    expect(resolveMetricsEnabled({ METRICS_ENABLED: 'off' })).toBe(false);
  });

  it('resolveAppEnv：缺失回落 development', () => {
    expect(resolveAppEnv({})).toBe('development');
    expect(resolveAppEnv({ APP_ENV: 'production' })).toBe('production');
  });
});
