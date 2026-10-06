/**
 * 职责：⑦ 我的 —— 用户信息 / 角色切换 / 设置入口 / 退出登录二次确认（ARCH §6.7 / PRD 6.7）。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  FadeIn,
  LoadingView,
  PressableScale,
  ScreenHeader,
  SegmentedControl,
  ErrorState,
  staggerDelay,
} from '@/components'
import { useAsync, useAuth } from '@/hooks'
import { USE_MOCK, focusService } from '@/services'
import { useConnectivity } from '@/store/ConnectivityProvider'
import { useTheme, useThemedStyles, type ThemeMode } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AppRole, NotificationPreference } from '@/types'
import { ROLE_LABEL } from '@/types'
import { useCan } from '@/utils/permission'

/** 角色分段选项 */
const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'manager', label: ROLE_LABEL.manager },
  { value: 'member', label: ROLE_LABEL.member },
]

/** 外观分段选项（D3：浅色 / 深色 / 跟随系统；Q14 切换即时生效、无需二次确认） */
const APPEARANCE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

/** 角色切换提示自动消失时长（毫秒） */
const ROLE_HINT_DURATION_MS = 1800

/** 我的页 */
export function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { user, tenant, role, setRole, signOutAsync, roles } = useAuth()
  const { colors, mode, setMode } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const can = useCan()
  // 增量 8 · Q2：「模拟离线」开关（仅 USE_MOCK === true 可见；仅会话内，不落盘）
  const { setSimulatedOffline } = useConnectivity()
  const [simulatedOffline, setSimulatedOfflineState] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [roleHint, setRoleHint] = useState<string | null>(null)
  /** 角色提示定时器（卸载时清理，避免卸载后 setState） */
  const roleHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (roleHintTimer.current) clearTimeout(roleHintTimer.current)
    }
  }, [])

  const preferences = useAsync<NotificationPreference[]>(
    () => focusService.getNotificationPreferences(user?.id ?? ''),
    [user?.id],
  )

  const enabledChannelCount = (preferences.data ?? []).reduce((sum, preference) => {
    const { email, push, im } = preference.channels
    return sum + (email ? 1 : 0) + (push ? 1 : 0) + (im ? 1 : 0)
  }, 0)

  const handleRoleChange = useCallback(
    async (next: AppRole) => {
      await setRole(next)
      setRoleHint(`已切换为「${ROLE_LABEL[next]}」视角`)
      if (roleHintTimer.current) clearTimeout(roleHintTimer.current)
      roleHintTimer.current = setTimeout(() => setRoleHint(null), ROLE_HINT_DURATION_MS)
    },
    [setRole],
  )

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOutAsync()
    } finally {
      setSigningOut(false)
      setConfirmVisible(false)
    }
  }, [signOutAsync])

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader title="我的" subtitle="身份、偏好与退出" large />

        {/* 用户信息卡 */}
        <FadeIn>
          <Card>
            <View style={styles.userRow}>
              <Avatar name={user?.displayName ?? '用户'} uri={user?.avatarUrl} size={56} ring />
              <View style={styles.userInfo}>
                <Text style={[typography.display, styles.userName]} numberOfLines={1}>
                  {user?.displayName ?? '未登录'}
                </Text>
                <Text style={[typography.caption, styles.userEmail]} numberOfLines={1}>
                  {user?.email ?? '—'}
                </Text>
                <View style={styles.tenantRow}>
                  <Feather name="briefcase" size={layout.icon.sm} color={colors.text.tertiary} />
                  <Text style={[typography.caption, styles.tenantText]} numberOfLines={1}>
                    {tenant?.name ?? '未加入团队'}
                    {tenant ? ` · ${tenant.plan.toUpperCase()}` : ''}
                  </Text>
                </View>
              </View>
            </View>
            {user?.motto ? (
              <Text style={[typography.caption, styles.motto]} numberOfLines={2}>
                “{user.motto}”
              </Text>
            ) : null}
          </Card>
        </FadeIn>

        {/* 角色切换 */}
        <FadeIn delay={staggerDelay(1)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>角色切换</Text>
          <Text style={[typography.caption, styles.sectionDesc]}>
            演示用视角切换（后端角色：{roles.length > 0 ? roles.join(' / ') : '未返回'}）
          </Text>
          <View style={styles.segmentedWrapper}>
            <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={(next) => void handleRoleChange(next)} />
          </View>
          {roleHint ? (
            <View style={styles.roleHint}>
              <Feather name="check-circle" size={layout.icon.sm} color={colors.success} />
              <Text style={[typography.caption, styles.roleHintText]}>{roleHint}</Text>
            </View>
          ) : null}
        </FadeIn>

        {/* 外观（D3）：浅色 / 深色 / 跟随系统，切换即时生效、无需二次确认（Q14） */}
        <FadeIn delay={staggerDelay(2)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>外观</Text>
          <View style={styles.segmentedWrapper}>
            <SegmentedControl
              options={APPEARANCE_OPTIONS}
              value={mode}
              onChange={(next) => void setMode(next)}
            />
          </View>
        </FadeIn>

        {/* 设置列表 */}
        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>设置</Text>
          <Card padded={false} style={styles.settingsCard}>
            <SettingRow
              icon="bell"
              label="通知偏好"
              value={
                preferences.loading
                  ? '加载中…'
                  : preferences.error
                    ? '加载失败'
                    : `已开启 ${enabledChannelCount} 个通道`
              }
              onPress={() => navigation.navigate('NotificationSettings')}
              isFirst
            />
            {/* 增量 1：个人计划 / 我的提报（两角色均可访问，无需权限门禁） */}
            <SettingRow
              icon="calendar"
              label="个人计划"
              value=""
              onPress={() => navigation.navigate('PersonalPlan')}
            />
            <SettingRow
              icon="send"
              label="我的提报"
              value=""
              onPress={() => navigation.navigate('MySubmissions')}
            />
            {/* 增量 7：审核中心入口（仅 review:view_pending 可见，即 manager） */}
            {can('review:view_pending') ? (
              <SettingRow
                icon="clipboard"
                label="审核中心"
                value=""
                onPress={() => navigation.navigate('AuditCenter')}
              />
            ) : null}
            {/* 增量 8：模拟离线开关（仅 mock 构建可见，Q2；打开 = 全局断网，关闭 = 触发恢复刷新） */}
            {USE_MOCK ? (
              <SettingRow
                icon="wifi-off"
                label="模拟离线"
                value=""
                showChevron={false}
                trailing={
                  <Switch
                    value={simulatedOffline}
                    onValueChange={(value) => {
                      setSimulatedOfflineState(value)
                      setSimulatedOffline(value)
                    }}
                    trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                    thumbColor={colors.bg.surface}
                    ios_backgroundColor={colors.borderStrong}
                  />
                }
              />
            ) : null}
            <SettingRow
              icon="globe"
              label="时区"
              value={user?.timezone ?? 'Asia/Shanghai'}
              showChevron={false}
            />
            <SettingRow
              icon="info"
              label="关于 OpenSchedule"
              value="v1.0.0"
              onPress={() => navigation.navigate('About')}
              isLast
            />
          </Card>
          {preferences.error ? (
            <ErrorState onRetry={() => void preferences.retry()} />
          ) : null}
          {preferences.loading ? <LoadingView variant="spinner" /> : null}
        </FadeIn>

        {/* 退出登录 */}
        <FadeIn delay={staggerDelay(4)} style={styles.section}>
          <Button
            label="退出登录"
            variant="danger"
            icon="log-out"
            fullWidth
            onPress={() => setConfirmVisible(true)}
          />
        </FadeIn>
      </ScrollView>

      {/* 退出二次确认 */}
      <BottomSheet
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        title="确认退出登录？"
        heightRatio={0.32}
      >
        <Text style={[typography.body, styles.confirmText]}>
          退出后需要重新输入账号密码才能进入工作台，本地计时数据会保留。
        </Text>
        <View style={styles.confirmActions}>
          <View style={styles.confirmButton}>
            <Button
              label="取消"
              variant="secondary"
              fullWidth
              onPress={() => setConfirmVisible(false)}
            />
          </View>
          <View style={styles.confirmButton}>
            <Button
              label="退出登录"
              variant="danger"
              fullWidth
              loading={signingOut}
              onPress={() => void handleSignOut()}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

/** 设置条目 */
function SettingRow({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  isFirst = false,
  isLast = false,
  trailing,
}: {
  icon: keyof typeof Feather.glyphMap
  label: string
  value: string
  onPress?: () => void
  showChevron?: boolean
  /** 是否为首行：补齐顶部圆角，避免按下底色方角戳出卡片圆角轮廓 */
  isFirst?: boolean
  /** 是否为末行：补齐底部圆角 */
  isLast?: boolean
  /** 行尾自定义元素（如 Switch）；提供时替代默认「值 + 箭头」 */
  trailing?: React.ReactNode
}): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  return (
    <PressableScale
      accessibilityRole={onPress ? 'button' : 'text'}
      onPress={onPress}
      disabled={!onPress}
      scale={1}
      pressedBg={colors.bg.subtle}
      style={[
        styles.settingRow,
        isLast ? null : styles.settingDivider,
        isFirst ? styles.settingRowFirst : null,
        isLast ? styles.settingRowLast : null,
      ]}
    >
      <Feather name={icon} size={layout.icon.md} color={colors.text.secondary} />
      <Text style={[typography.body, styles.settingLabel]} numberOfLines={1}>
        {label}
      </Text>
      {trailing ?? (
        <>
          <Text style={[typography.caption, styles.settingValue]} numberOfLines={1}>
            {value}
          </Text>
          {showChevron ? (
            <Feather name="chevron-right" size={layout.icon.md} color={colors.text.tertiary} />
          ) : null}
        </>
      )}
    </PressableScale>
  )
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.baseWarm,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  userName: {
    color: colors.text.primary,
  },
  userEmail: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  tenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  tenantText: {
    color: colors.text.tertiary,
    marginLeft: spacing.xxs,
    flex: 1,
  },
  motto: {
    color: colors.text.secondary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  section: {
    marginTop: layout.sectionGap,
    paddingHorizontal: layout.screenPadding,
  },
  sectionTitle: {
    color: colors.text.primary,
  },
  sectionDesc: {
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  segmentedWrapper: {
    marginTop: spacing.sm,
  },
  roleHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  roleHintText: {
    color: colors.success,
    marginLeft: spacing.xxs,
  },
  settingsCard: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.cardPadding,
    paddingVertical: spacing.md,
  },
  settingDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // 首 / 末行补齐对应角圆角（值 = 容器圆角 token radius.card），
  // 使按下底色与卡片圆角吻合，避免方角戳出卡片轮廓
  settingRowFirst: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  settingRowLast: {
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  settingLabel: {
    flex: 1,
    color: colors.text.primary,
    marginLeft: spacing.sm,
  },
  settingValue: {
    color: colors.text.secondary,
    marginRight: spacing.xs,
    maxWidth: '45%',
  },
  confirmText: {
    color: colors.text.secondary,
  },
  confirmActions: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  confirmButton: {
    flex: 1,
    marginRight: spacing.sm,
  },
})
