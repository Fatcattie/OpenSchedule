/** 键排序的稳定 JSON（JSONB 会重排对象键，比较前须规范化） */
export function stableStringify(value: unknown): string {
  return (
    JSON.stringify(value, (_k, v: unknown) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return Object.keys(v as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (v as Record<string, unknown>)[k];
            return acc;
          }, {});
      }
      return v;
    }) ?? 'null'
  );
}

export function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * 前端完成提报时间为本地「YYYY-MM-DD HH:mm」（默认 UTC+8，与用户默认时区 Asia/Shanghai 一致），
 * 已是 ISO 的原样返回；无法解析返回 fallback。
 */
export function toIsoFromLocal(value: string | null | undefined, fallback: string, offset = '+08:00'): string {
  if (!value) return fallback;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(value);
  const candidate = m ? `${m[1]}T${m[2]}:00${offset}` : value;
  const t = Date.parse(candidate);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}
