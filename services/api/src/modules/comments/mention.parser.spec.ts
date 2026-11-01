import { describe, expect, it } from 'vitest'
import { parseMentions } from './mention.parser';

describe('parseMentions', () => {
  it('resolves exact member display names and preserves character offsets', () => {
    expect(parseMentions('请 @张三 和 @alice 确认', [
      { id: 'u1', displayName: '张三' },
      { id: 'u2', displayName: 'alice' },
    ])).toEqual([
      { userId: 'u1', offset: 2, length: 3 },
      { userId: 'u2', offset: 8, length: 6 },
    ]);
  });

  it('ignores unknown names and does not treat a single-character token as a mention', () => {
    expect(parseMentions('@未知 @a @张三', [{ id: 'u1', displayName: '张三' }])).toEqual([
      { userId: 'u1', offset: 7, length: 3 },
    ]);
  });
});
