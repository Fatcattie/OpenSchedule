export type TodayItem = {
  id: string;
  title: string;
  type: 'team' | 'personal';
  status: string;
  priority: string;
  dueAt: Date | null;
};

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

export function sortTodayItems<T extends TodayItem>(items: T[], now = new Date()): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aOverdue = !!a.item.dueAt && a.item.dueAt.getTime() < now.getTime();
      const bOverdue = !!b.item.dueAt && b.item.dueAt.getTime() < now.getTime();
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (a.item.dueAt && b.item.dueAt && a.item.dueAt.getTime() !== b.item.dueAt.getTime()) {
        return a.item.dueAt.getTime() - b.item.dueAt.getTime();
      }
      if (!!a.item.dueAt !== !!b.item.dueAt) return a.item.dueAt ? -1 : 1;
      if (a.item.dueAt && b.item.dueAt) {
        const priorityDiff = (PRIORITY_WEIGHT[b.item.priority] ?? 0) - (PRIORITY_WEIGHT[a.item.priority] ?? 0);
        if (priorityDiff) return priorityDiff;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
