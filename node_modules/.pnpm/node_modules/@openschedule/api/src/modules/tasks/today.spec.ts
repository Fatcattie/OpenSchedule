import { sortTodayItems, TodayItem } from './today';

describe('sortTodayItems', () => {
  it('puts overdue items first, then nearest due date, then higher priority', () => {
    const items: TodayItem[] = [
      { id: 'low', title: '低优先级', type: 'team', status: 'todo', priority: 'low', dueAt: new Date('2026-08-25T12:00:00Z') },
      { id: 'overdue', title: '已逾期', type: 'personal', status: 'in_progress', priority: 'medium', dueAt: new Date('2026-08-20T12:00:00Z') },
      { id: 'urgent', title: '紧急', type: 'team', status: 'todo', priority: 'urgent', dueAt: new Date('2026-08-24T12:00:00Z') },
    ];

    expect(sortTodayItems(items, new Date('2026-08-22T12:00:00Z')).map((item) => item.id)).toEqual([
      'overdue',
      'urgent',
      'low',
    ]);
  });

  it('keeps undated items after dated items without changing their stable order', () => {
    const items: TodayItem[] = [
      { id: 'first', title: '无日期 1', type: 'personal', status: 'todo', priority: 'medium', dueAt: null },
      { id: 'dated', title: '有日期', type: 'team', status: 'todo', priority: 'low', dueAt: new Date('2026-08-23T12:00:00Z') },
      { id: 'second', title: '无日期 2', type: 'team', status: 'in_progress', priority: 'urgent', dueAt: null },
    ];

    expect(sortTodayItems(items, new Date('2026-08-22T12:00:00Z')).map((item) => item.id)).toEqual([
      'dated',
      'first',
      'second',
    ]);
  });
});
