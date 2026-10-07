/**
 * 职责：zh 字典 —— 导航层域（增量 12 · L2 · T02 填充）。
 *
 * T01 仅建立**空骨架**（`as const` 保证键为字面量联合）；键由 T02 填充（`nav.*`：Tab + Stack 标题）。
 */

/** 导航层词条（T02 填充） */
export const nav = {} as const
