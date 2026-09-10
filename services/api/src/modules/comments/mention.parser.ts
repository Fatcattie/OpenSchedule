/**
 * @提及解析（占位实现）：正则抽取 @名字 → 精确匹配项目内成员 displayName，产出 [{userId, offset, length}] 写入 mentions jsonb。
 * TODO(Phase 2)：模糊/前缀/拼音匹配、@角色、@AI（走独立事件）；解析仅限项目内成员（§3.4 评论/@ 行）。
 */
export interface ParsedMention {
  userId: string;
  /** '@' 在正文中的字符偏移 */
  offset: number;
  /** '@名字' 总长度 */
  length: number;
}

/** @提及正则：@ 后 2-30 个中英文/数字/下划线/连字符 */
const MENTION_RE = /@([A-Za-z0-9_\u4e00-\u9fa5-]{2,30})/gu;

export function parseMentions(content: string, members: { id: string; displayName: string }[]): ParsedMention[] {
  const result: ParsedMention[] = [];
  const byName = new Map<string, string>();
  for (const m of members) {
    byName.set(m.displayName, m.id);
    if (m.displayName.startsWith('@')) byName.set(m.displayName.slice(1), m.id);
  }
  for (const match of content.matchAll(MENTION_RE)) {
    const userId = byName.get(match[1]);
    if (userId) result.push({ userId, offset: match.index, length: match[0].length });
  }
  return result;
}
