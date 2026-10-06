/**
 * 职责：hooks 桶文件 —— 统一导出全部自定义 hook 与相关类型。
 */
export { useAsync } from './useAsync'
export type { UseAsyncResult, UseAsyncOptions } from './useAsync'
export { useAuth } from './useAuth'
export type { UseAuthResult } from './useAuth'
export { useTimer } from './useTimer'
export type { UseTimerResult } from './useTimer'
export { useSwipeAction } from './useSwipeAction'
export type { SwipeAction, UseSwipeActionOptions, UseSwipeActionResult } from './useSwipeAction'
export { usePressScale } from './usePressScale'
export type { UsePressScaleResult } from './usePressScale'
export { useCardLift } from './useCardLift'
export type { UseCardLiftResult } from './useCardLift'
export { useDragReschedule } from './useDragReschedule'
export type { UseDragRescheduleOptions, UseDragRescheduleResult } from './useDragReschedule'
export { useAppContext } from '@/store/AppProvider'
export type { AppContextValue, AppPreferences, OptimisticEntry } from '@/store/AppProvider'
