/**
 * 职责：设计 token 唯一来源 —— 色彩 / 字号 / 间距 / 圆角 / 阴影 / 动效。
 * 严格对齐 ARCH-mobile.md §3.1–§3.6；所有样式数值必须引用本文件，禁止内联魔法数字。
 *
 * 增量 10（深色模式）：色彩 token 双套化 —— `lightColors`（= 改造前 `colors`，逐字节冻结）
 * 与 `darkColors`（新增，附录 A）。保留 `export const colors = lightColors` 兼容导出
 * （供测试与未迁移引用兜底）；运行时取色请走 `useTheme()` / `useThemeColors()`。
 */
import { Easing, Platform, type TextStyle, type ViewStyle } from 'react-native'

/** 字体族：iOS 用 System，Android 用 sans-serif，Web/兜底用 System */
export const fontFamily: string | undefined = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
})

/** 浅色色彩 token（§3.1；= 改造前 `colors`，值逐字节冻结） */
export const lightColors = {
  /** 页面/容器底色 */
  bg: {
    /** 页面底色（浅灰） */
    base: '#F7F8FA',
    /** 象牙白底（登录 / 我的可用） */
    baseWarm: '#FBFAF7',
    /** 卡片、抽屉、输入框 */
    surface: '#FFFFFF',
    /** 骨架屏、内嵌区、按压缩进 */
    subtle: '#F1F3F7',
  },
  /** 主按钮、标题、选中态（深墨蓝） */
  primary: '#1B2A4A',
  /** 次级强调、进行中状态 */
  primarySoft: '#2E4470',
  /** 主色淡底（Chip / 标签底色） */
  primaryFaint: '#EAEEF5',
  /** 成功 / 通过 的浅底（柔和按钮、状态底色） */
  successFaint: '#E9F6F0',
  /** 错误 / 驳回 的浅底（柔和按钮、状态底色） */
  dangerFaint: '#FBEDED',
  /** 警告 / 退回重改 的浅底（柔和按钮、状态底色） */
  warningFaint: '#FAF4EA',
  /** 文字层级 */
  text: {
    /** 正文 */
    primary: '#1A1D24',
    /** 辅助信息 */
    secondary: '#6B7280',
    /** 占位、禁用、已取消 */
    tertiary: '#9AA1AE',
    /** 深底上的文字 */
    inverse: '#FFFFFF',
  },
  /** 分割线、卡片描边（1px） */
  border: '#ECEEF2',
  /** 输入框默认描边 */
  borderStrong: '#DDE1E8',
  /** 抽屉遮罩 */
  overlay: 'rgba(27,42,74,0.45)',
  /** 完成 / 通过 */
  success: '#2F9E6E',
  /** 阻塞 / 临期 */
  warning: '#C8871B',
  /** 错误 / 驳回 / 退出 */
  danger: '#C24A4A',
  /** 仅品牌区（登录头 / 头像环）线性渐变 */
  brandGradient: ['#1B2A4A', '#2E4470'] as string[],
}

/** 色彩 token 结构类型（浅 / 深两套结构一致，编译期强约束） */
export type ThemeColors = typeof lightColors

/** 深色色彩 token（增量 10 · 附录 A；值严格取自架构文档，不得自行调色） */
export const darkColors: ThemeColors = {
  /** 页面/容器底色（深墨蓝基底近黑，非纯黑） */
  bg: {
    /** 页面底色 */
    base: '#0F1626',
    /** 略暖略浅一档（登录 / 我的可用） */
    baseWarm: '#141A26',
    /** 卡片、抽屉、输入框（比 base 亮一档） */
    surface: '#1A2333',
    /** 骨架屏、内嵌区、按压缩进 */
    subtle: '#141C2B',
  },
  /** 主按钮填充 + 选中 tint（单值双角色） */
  primary: '#3E6FD9',
  /** 次级强调 / 进行中 / 强调文字 */
  primarySoft: '#6E93E0',
  /** 低明度同色相容器（语义反转） */
  primaryFaint: '#1E2A44',
  /** 深绿底 */
  successFaint: '#13291F',
  /** 深红底 */
  dangerFaint: '#2C1A1C',
  /** 深琥珀底 */
  warningFaint: '#2B2313',
  /** 文字层级 */
  text: {
    /** 正文（近白，非纯白） */
    primary: '#E8EAF0',
    /** 辅助信息 */
    secondary: '#A6ADBB',
    /** 占位、禁用、已取消（最弱一级） */
    tertiary: '#7A8291',
    /** 深底上的文字（不变） */
    inverse: '#FFFFFF',
  },
  /** 低对比白描边（8%） */
  border: 'rgba(255,255,255,0.08)',
  /** 输入框描边（14%） */
  borderStrong: 'rgba(255,255,255,0.14)',
  /** 抽屉遮罩（更深） */
  overlay: 'rgba(0,0,0,0.60)',
  /** 完成 / 通过（提亮） */
  success: '#3DBE8B',
  /** 阻塞 / 临期（提亮） */
  warning: '#E0A33A',
  /** 错误 / 驳回（提亮） */
  danger: '#E36B6B',
  /** 品牌渐变（提亮一档，非霓虹） */
  brandGradient: ['#24406E', '#3A5DA0'] as string[],
}

/**
 * 兼容导出（L2）：浅色静态色板。
 * 业务源码不再引用（改用 `useTheme()`）；仅供测试 / 未迁移引用 / 默认参数兜底。
 */
export const colors = lightColors

/** 字号与字重层级（§3.2） */
export const typography: Record<
  'display' | 'title' | 'body' | 'caption' | 'label' | 'mono',
  TextStyle
> = {
  /** 页面主标题 */
  display: { fontFamily, fontSize: 22, fontWeight: '700', letterSpacing: -0.2, lineHeight: 30 },
  /** 卡片 / 区块标题 */
  title: { fontFamily, fontSize: 17, fontWeight: '600', letterSpacing: -0.1, lineHeight: 24 },
  /** 正文 */
  body: { fontFamily, fontSize: 15, fontWeight: '400', letterSpacing: 0, lineHeight: 22 },
  /** 辅助信息 */
  caption: { fontFamily, fontSize: 13, fontWeight: '400', letterSpacing: 0, lineHeight: 18 },
  /** 标签 / 分组小标题 */
  label: { fontFamily, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, lineHeight: 16 },
  /** 计时 / 工时（等宽数字防跳动） */
  mono: {
    fontFamily,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
}

/** 间距栅格（4pt 基准，§3.3） */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  /** 页面左右留白 */
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
}

/**
 * 圆角（§3.4）：仅 12 / 16 / 20 / 28 / 999 五档，禁止其它值。
 * 设计语言升级：整体上调一档，营造更圆润的观感（sm 8→12、control 12→16、
 * card 16→20、sheet 20→28），pill 仍为完全胶囊 999。
 */
export const radius = {
  /** 小控件 / 图标底 */
  sm: 12,
  /** 按钮 / 输入框 / 分段 */
  control: 16,
  /** 卡片 / 抽屉内容 */
  card: 20,
  /** 抽屉顶部圆角 */
  sheet: 28,
  /** 标签 / 胶囊 / Chip */
  pill: 999,
}

/** 阴影 / 层级（§3.5）：iOS shadow* + Android elevation；配合更大圆角，光晕更大更淡 */
export const shadow: Record<'card' | 'raised' | 'floating' | 'cardLift', ViewStyle> = {
  /** 普通卡片 */
  card: {
    shadowColor: '#1B2A4A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  /** 底部操作条 / 抽屉 */
  raised: {
    shadowColor: '#1B2A4A',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  /** 浮动按钮 FAB */
  floating: {
    shadowColor: '#1B2A4A',
    shadowOpacity: 0.14,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  /** 卡片按下「浮起」时的阴影：与 card 同 offset，仅加深加大 */
  cardLift: {
    shadowColor: '#1B2A4A',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10,
  },
}

/** 动效（§3.6） */
export const motion = {
  /** 时长（毫秒） */
  duration: {
    /** 颜色 / 透明度瞬变 */
    instant: 100,
    /** 按压反馈（spring 起步 / 颜色过渡） */
    fast: 140,
    /** 列表入场、状态标签过渡 */
    base: 240,
    /** 抽屉 / 页面切换 */
    slow: 340,
  },
  /** 列表入场错峰步长（毫秒） */
  stagger: 45,
  /** 错峰最多应用项数 */
  staggerMax: 7,
  /** 统一缓动 */
  easing: {
    /** 统一缓动：bezier(0.2, 0, 0, 1) */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** 入场减速 */
    decelerate: Easing.out(Easing.cubic),
  },
  /** spring 参数 */
  spring: {
    /** 抽屉弹入：更绵软（低刚度 + 略高阻尼） */
    sheet: { damping: 24, stiffness: 200, mass: 0.9 },
    /** 按压反馈：跟手回弹，位移量极小（scale 1↔0.97）故无可见过冲 */
    press: { damping: 18, stiffness: 320, mass: 0.7 },
  },
  /** 卡片浮起：按下向上位移 + 轻微放大 + 悬停强度 */
  lift: {
    /** 按下时向上位移（px，正数存值，用时取负） */
    offset: 4,
    /** 按下时缩放（略大于 1，朝观察者靠近以强化立体感） */
    scale: 1.015,
    /** 鼠标悬停强度（0~1，Web 专用） */
    hoverRatio: 0.45,
    /** 浮起动画 spring：比 motion.spring.press 更绵软，突出「浮起」感 */
    spring: { damping: 20, stiffness: 260, mass: 0.8 },
  },
  /** 列表入场位移（px） */
  enterOffset: 12,
  /** 骨架屏 shimmer 循环（毫秒） */
  skeletonShimmer: 1200,
  /** 登录错误抖动：2 次 × 120ms */
  shake: { count: 2, duration: 120, distance: 8 },
}

/** 组件层通用常量（非设计 token，但与 token 同源，避免散落魔法数字） */
export const layout = {
  /** 页面左右留白 */
  screenPadding: spacing.lg,
  /** 页面顶部（含安全区） */
  screenTop: spacing.xl,
  /** 卡片内边距 */
  cardPadding: spacing.md,
  /** 卡片之间间距 */
  cardGap: spacing.sm,
  /** 区块之间间距 */
  sectionGap: spacing.xl,
  /** 图标尺寸 */
  icon: { sm: 16, md: 20, lg: 24 },
  /** 优先级色条宽度 */
  priorityBarWidth: 3,
  /** 底部 Tab 高度 */
  tabBarHeight: 56,
}

/**
 * 设计 token 聚合导出。
 * 说明：`tokens.colors` 仍指向浅色 `lightColors`（保持 `Tokens` 类型不变，§9-M7）；
 * 运行时取色请使用 `ThemeProvider` 下发的 `colors`。
 */
export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
  motion,
  layout,
  fontFamily,
}

export type Tokens = typeof tokens
