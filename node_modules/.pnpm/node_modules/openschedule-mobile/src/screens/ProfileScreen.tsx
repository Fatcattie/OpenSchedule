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
import type { LocalePreference, TranslationKey } from '@/i18n'
import { USE_MOCK, focusService } from '@/services'
import { useConnectivity } from '@/store/ConnectivityProvider'
import { useI18n } from '@/store/I18nProvider'
import { useTheme, useThemedStyles, type ThemeMode } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp, AppRole, NotificationPreference } from '@/types'
import { useCan } from '@/utils/permission'

/** 角色分段选项（`labelKey` 走字典 `role.*`，渲染期由 `t()` 取词） */
const ROLE_OPTIONS: { value: AppRole; labelKey: TranslationKey }[] = [
  { value: 'manager', labelKey: 'role.manager' },
  { value: 'member', labelKey: 'role.member' },
]

/** 外观分段选项（D3：浅色 / 深色 / 跟随系统；Q14 切换即时生效、无需二次确认） */
const APPEARANCE_OPTIONS: { value: ThemeMode; labelKey: TranslationKey }[] = [
  { value: 'light', labelKey: 'screens.core.profile.appearanceLight' },
  { value: 'dark', labelKey: 'screens.core.profile.appearanceDark' },
  { value: 'system', labelKey: 'screens.core.profile.appearanceSystem' },
]

/**
 * 语言分段选项（L1，与「外观」同构）。
 *
 * - 两个语言名用**自身语言**书写（`中文` / `English`），**不随界面语言变化**——切到看不懂的语言后
 *   仍能找到切回来的入口（US-12-08）；
 * - 第三态是**功能项**而非语言名（`跟随系统` / `System`），故**随界面语言变化**，由调用方传入已取词的 `systemLabel`。
 */
function buildLanguageOptions(systemLabel: string): { value: LocalePreference; label: string }[] {
  return [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'system', label: systemLabel },
  ]
}

/** 角色切换提示自动消失时长（毫秒） */
const ROLE_HINT_DURATION_MS = 1800

/** 我的页 */
export function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { user, tenant, role, setRole, signOutAsync, roles } = useAuth()
  const { colors, mode, setMode } = useTheme()
  // 语言态（L1）：无 Provider 时回退 zh-CN（既有渲染套件不包 Provider）
  const { preference, setPreference, t } = useI18n()
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

  /** 角色 / 外观分段选项（渲染期取词，语言切换即时生效） */
  const roleOptions = ROLE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))
  const appearanceOptions = APPEARANCE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }))

  const handleRoleChange = useCallback(
    async (next: AppRole) => {
      await setRole(next)
      setRoleHint(t('screens.core.profile.roleSwitchedHint', { role: t(`role.${next}`) }))
      if (roleHintTimer.current) clearTimeout(roleHintTimer.current)
      roleHintTimer.current = setTimeout(() => setRoleHint(null), ROLE_HINT_DURATION_MS)
    },
    [setRole, t],
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
        <ScreenHeader title={t('screens.core.profile.title')} subtitle={t('screens.core.profile.subtitle')} large />

        {/* 用户信息卡 */}
        <FadeIn>
          <Card>
            <View style={styles.userRow}>
              <Avatar name={user?.displayName ?? t('screens.core.profile.userFallback')} uri={user?.avatarUrl} size={56} ring />
              <View style={styles.userInfo}>
                <Text style={[typography.display, styles.userName]} numberOfLines={1}>
                  {user?.displayName ?? t('screens.core.profile.notSignedIn')}
                </Text>
                <Text style={[typography.caption, styles.userEmail]} numberOfLines={1}>
                  {user?.email ?? '—'}
                </Text>
                <View style={styles.tenantRow}>
                  <Feather name="briefcase" size={layout.icon.sm} color={colors.text.tertiary} />
                  <Text style={[typography.caption, styles.tenantText]} numberOfLines={1}>
                    {tenant?.name ?? t('screens.core.profile.noTeam')}
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
          <Text style={[typography.title, styles.sectionTitle]}>{t('screens.core.profile.roleSectionTitle')}</Text>
          <Text style={[typography.caption, styles.sectionDesc]}>
            {t('screens.core.profile.roleSectionDesc', {
              roles: roles.length > 0 ? roles.join(' / ') : t('screens.core.profile.rolesNone'),
            })}
          </Text>
          <View style={styles.segmentedWrapper}>
            <SegmentedControl options={roleOptions} value={role} onChange={(next) => void handleRoleChange(next)} />
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
          <Text style={[typography.title, styles.sectionTitle]}>{t('screens.core.profile.appearanceTitle')}</Text>
          <View style={styles.segmentedWrapper}>
            <SegmentedControl
              options={appearanceOptions}
              value={mode}
              onChange={(next) => void setMode(next)}
            />
          </View>
        </FadeIn>

        {/* 语言（L1）：中文 / English / 跟随系统，切换即时生效、无需二次确认（M-P2-05-07 / -13，与「外观」同构） */}
        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>{t('profile.language.title')}</Text>
          <View style={styles.segmentedWrapper}>
            <SegmentedControl
              options={buildLanguageOptions(t('profile.language.system'))}
              value={preference}
              onChange={(next) => void setPreference(next)}
            />
          </View>
          {/* 残留范围说明（M-P2-05-13）：随语言切换，明示「日期格式 / 演示数据 / 服务端提示仍为中文」 */}
          <Text style={[typography.caption, styles.sectionDesc]}>
            {t('profile.language.residual')}
          </Text>
        </FadeIn>

        {/* 设置列表 */}
        <FadeIn delay={staggerDelay(4)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>{t('screens.core.profile.settingsTitle')}</Text>
          <Card padded={false} style={styles.settingsCard}>
            <SettingRow
              icon="bell"
              label={t('screens.core.profile.notificationPrefs')}
              value={
                preferences.loading
                  ? t('screens.core.profile.loading')
                  : preferences.error
                    ? t('screens.core.profile.loadFailed')
                    : t('screens.core.profile.channelsEnabled', { count: enabledChannelCount })
              }
              onPress={() => navigation.navigate('NotificationSettings')}
              isFirst
            />
            {/* 增量 1：个人计划 / 我的提报（两角色均可访问，无需权限门禁） */}
            <SettingRow
              icon="calendar"
              label={t('screens.core.profile.personalPlan')}
              value=""
              onPress={() => navigation.navigate('PersonalPlan')}
            />
            <SettingRow
              icon="send"
              label={t('screens.core.profile.mySubmissions')}
              value=""
              onPress={() => navigation.navigate('MySubmissions')}
            />
            {/* 增量 7：审核中心入口（仅 review:view_pending 可见，即 manager） */}
            {can('review:view_pending') ? (
              <SettingRow
                icon="clipboard"
                label={t('screens.core.profile.auditCenter')}
                value=""
                onPress={() => navigation.navigate('AuditCenter')}
              />
            ) : null}
            {/* 增量 8：模拟离线开关（仅 mock 构建可见，Q2；打开 = 全局断网，关闭 = 触发恢复刷新） */}
            {USE_MOCK ? (
              <SettingRow
                icon="wifi-off"
                label={t('screens.core.profile.simulatedOffline')}
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
              label={t('screens.core.profile.timezone')}
              value={user?.timezone ?? 'Asia/Shanghai'}
              showChevron={false}
            />
            <SettingRow
              icon="info"
              label={t('screens.core.profile.about')}
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
        <FadeIn delay={staggerDelay(5)} style={styles.section}>
          <Button
            label={t('screens.core.profile.signOut')}
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
        title={t('screens.core.profile.signOutConfirmTitle')}
        heightRatio={0.32}
      >
        <Text style={[typography.body, styles.confirmText]}>
          {t('screens.core.profile.signOutConfirmText')}
        </Text>
        <View style={styles.confirmActions}>
          <View style={styles.confirmButton}>
            <Button
              label={t('screens.core.profile.cancel')}
              variant="secondary"
              fullWidth
              onPress={() => setConfirmVisible(false)}
            />
          </View>
          <View style={styles.confirmButton}>
            <Button
              label={t('screens.core.profile.signOut')}
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
