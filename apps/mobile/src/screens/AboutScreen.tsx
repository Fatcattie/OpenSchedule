/**
 * 职责：关于页 —— 产品信息 / 技术栈 / 首版能力范围与已知限制。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BrandGradient, Card, FadeIn, ScreenHeader, Tag, staggerDelay } from '@/components'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp } from '@/types'

/** 首版核心能力 */
const FEATURES = [
  '登录与会话持久化（含生物识别快捷解锁）',
  '工作台：我的待办 / 团队动态 / 临期预警',
  '今日聚焦：三分组 + 右滑快操作 + 撤销',
  '项目看板：看板列视图 + 状态流转（乐观锁）',
  '任务详情：状态机 / 计时 / 评论 / 附件 / 依赖',
  '时间容器：日 / 周视图 + 空闲时段识别',
]

/** 技术栈 */
const STACK = ['React Native + Expo', 'TypeScript（严格模式）', 'React Navigation 7', 'React Context + useAsync']

/** 已知限制 */
const LIMITS = [
  '写接口当前走本地 mock 成功路径，接后端时只需将 EXPO_PUBLIC_USE_MOCK 置为 false',
  '推送通道首版仅站内通知 + 轮询，未接入真推送',
  '看板暂不支持拖拽流转，改用卡片菜单切换状态',
  'Web 端生物识别不可用，自动回落密码登录',
]

/** 关于页 */
export function AboutScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.root}>
      <ScreenHeader title="关于" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <BrandGradient direction="vertical" style={styles.banner}>
            <View style={styles.logo}>
              <Feather name="calendar" size={layout.icon.lg + spacing.xxs} color={colors.text.inverse} />
            </View>
            <Text style={[typography.display, styles.brandName]}>OpenSchedule</Text>
            <Text style={[typography.caption, styles.brandSlogan]}>
              把「计划—执行—复盘」闭环装进口袋
            </Text>
            <View style={styles.versionRow}>
              <Tag text="v1.0.0" tone="neutral" />
              <View style={styles.versionGap} />
              <Tag text="首版" tone="neutral" />
            </View>
          </BrandGradient>
        </FadeIn>

        <FadeIn delay={staggerDelay(1)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>首版核心能力</Text>
          <Card>
            {FEATURES.map((feature, index) => (
              <View key={feature} style={[styles.listRow, index < FEATURES.length - 1 ? styles.listDivider : null]}>
                <Feather name="check" size={layout.icon.sm} color={colors.success} />
                <Text style={[typography.body, styles.listText]}>{feature}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={staggerDelay(2)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>技术栈</Text>
          <Card>
            {STACK.map((item, index) => (
              <View key={item} style={[styles.listRow, index < STACK.length - 1 ? styles.listDivider : null]}>
                <Feather name="cpu" size={layout.icon.sm} color={colors.text.secondary} />
                <Text style={[typography.body, styles.listText]}>{item}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>已知限制</Text>
          <Card>
            {LIMITS.map((item, index) => (
              <View key={item} style={[styles.listRow, index < LIMITS.length - 1 ? styles.listDivider : null]}>
                <Feather name="info" size={layout.icon.sm} color={colors.warning} />
                <Text style={[typography.caption, styles.listText]}>{item}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <Text style={[typography.caption, styles.footer]}>
          © 2026 OpenSchedule · 本页面为移动端首版演示，数据来自本地 mock 服务层
        </Text>
      </ScrollView>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxxl,
  },
  banner: {
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  logo: {
    width: spacing.xxxl + spacing.xs,
    height: spacing.xxxl + spacing.xs,
    borderRadius: radius.card,
    backgroundColor: `${colors.text.inverse}22`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    color: colors.text.inverse,
  },
  brandSlogan: {
    color: `${colors.text.inverse}CC`,
    marginTop: spacing.xxs,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  versionGap: {
    width: spacing.xs,
  },
  section: {
    marginTop: layout.sectionGap,
  },
  sectionTitle: {
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  listDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listText: {
    flex: 1,
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },
  footer: {
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
