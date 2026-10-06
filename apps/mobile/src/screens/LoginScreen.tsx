/**
 * 职责：① 登录页 —— 品牌区（渐变）+ 账号密码 + 记住我 + 生物识别快捷解锁（ARCH §6.1 / PRD 6.1）。
 * 空态按钮置灰、加载态内嵌细环、错误态红字 + 表单横向抖动（2 次 × 120ms）。
 */
import { Feather } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BrandGradient, Button, FadeIn, PressableScale, TextField } from '@/components'
import { useAuth } from '@/hooks'
import { DEMO_CREDENTIALS } from '@/services/auth.service'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, motion, radius, spacing, typography, type ThemeColors } from '@/theme'

/** 品牌区高度 */
const BRAND_HEIGHT = 260
/** 抖动幅度（px） */
const SHAKE_DISTANCE = motion.shake.distance
/** 抖动单次时长 */
const SHAKE_DURATION = motion.shake.duration

/** 登录页 */
export function LoginScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const auth = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const shakeX = useRef(new Animated.Value(0)).current
  const brandOpacity = useRef(new Animated.Value(0)).current
  const brandTranslate = useRef(new Animated.Value(-motion.enterOffset * 2)).current

  // 品牌区入场（向上淡入），替代「成功离场」动画（根导航为声明式切换）
  useEffect(() => {
    Animated.parallel([
      Animated.timing(brandOpacity, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(brandTranslate, {
        toValue: 0,
        duration: motion.duration.slow,
        easing: motion.easing.decelerate,
        useNativeDriver: true,
      }),
    ]).start()
  }, [brandOpacity, brandTranslate])

  /** 表单横向抖动 */
  const playShake = () => {
    shakeX.setValue(0)
    Animated.sequence([
      Animated.timing(shakeX, { toValue: SHAKE_DISTANCE, duration: SHAKE_DURATION, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -SHAKE_DISTANCE, duration: SHAKE_DURATION, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: SHAKE_DISTANCE / 2, duration: SHAKE_DURATION, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: SHAKE_DURATION, useNativeDriver: true }),
    ]).start()
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !auth.submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLocalError(null)
    auth.clearError()
    const ok = await auth.signInWithPassword({ email: email.trim(), password }, rememberMe)
    if (!ok) playShake()
  }

  const handleBiometric = async () => {
    setLocalError(null)
    auth.clearError()
    const ok = await auth.signInWithBiometrics()
    if (!ok) playShake()
  }

  const fillDemoAccount = () => {
    setEmail(DEMO_CREDENTIALS.email)
    setPassword(DEMO_CREDENTIALS.password)
    setLocalError(null)
  }

  const errorText = localError ?? auth.error

  return (
    <View style={styles.root}>
      {/* 品牌区：渐变仅用于品牌区（§3.7-6） */}
      <BrandGradient
        direction="vertical"
        style={[styles.brand, { paddingTop: insets.top + spacing.xxl }]}
      >
        <Animated.View
          style={{ opacity: brandOpacity, transform: [{ translateY: brandTranslate }] }}
        >
          <View style={styles.logo}>
            <Feather name="calendar" size={layout.icon.lg + spacing.xxs} color={colors.text.inverse} />
          </View>
          <Text style={[typography.display, styles.brandTitle]}>OpenSchedule</Text>
          <Text style={[typography.caption, styles.brandSlogan]}>
            把「计划—执行—复盘」装进口袋
          </Text>
        </Animated.View>
      </BrandGradient>

      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeX }] }]}>
            <FadeIn delay={motion.stagger}>
              <Text style={[typography.title, styles.formTitle]}>登录你的工作台</Text>
            </FadeIn>

            <FadeIn delay={motion.stagger * 2} style={styles.field}>
              <TextField
                label="账号"
                value={email}
                onChangeText={(value) => {
                  setEmail(value)
                  setLocalError(null)
                }}
                keyboardType="email-address"
                editable={!auth.submitting}
              />
            </FadeIn>

            <FadeIn delay={motion.stagger * 3} style={styles.field}>
              <TextField
                label="密码"
                value={password}
                onChangeText={(value) => {
                  setPassword(value)
                  setLocalError(null)
                }}
                secureTextEntry={!showPassword}
                editable={!auth.submitting}
                onSubmitEditing={handleSubmit}
                right={
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'}
                    onPress={() => setShowPassword((previous) => !previous)}
                    hitSlop={spacing.xs}
                    scale={0.92}
                  >
                    <Feather
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={layout.icon.md}
                      color={colors.text.secondary}
                    />
                  </PressableScale>
                }
              />
            </FadeIn>

            <FadeIn delay={motion.stagger * 4} style={styles.optionRow}>
              <PressableScale
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                onPress={() => setRememberMe((previous) => !previous)}
                scale={0.96}
                style={styles.rememberRow}
                hitSlop={spacing.xs}
              >
                <Feather
                  name={rememberMe ? 'check-square' : 'square'}
                  size={layout.icon.md}
                  color={rememberMe ? colors.primary : colors.text.tertiary}
                />
                <Text style={[typography.caption, styles.rememberText]}>记住我</Text>
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                onPress={() => setLocalError('请联系团队管理员重置密码（演示环境暂不支持）')}
                hitSlop={spacing.xs}
                scale={0.94}
              >
                <Text style={[typography.caption, styles.link]}>忘记密码</Text>
              </PressableScale>
            </FadeIn>

            {errorText ? (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={layout.icon.sm} color={colors.danger} />
                <Text style={[typography.caption, styles.errorText]}>{errorText}</Text>
              </View>
            ) : null}

            <FadeIn delay={motion.stagger * 5} style={styles.submit}>
              <Button
                label="登录"
                size="lg"
                fullWidth
                loading={auth.submitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
              />
            </FadeIn>

            {auth.biometrics.available ? (
              <PressableScale
                accessibilityRole="button"
                onPress={handleBiometric}
                disabled={auth.submitting}
                scale={0.96}
                style={styles.biometric}
              >
                <Feather name="smile" size={layout.icon.md} color={colors.primary} />
                <Text style={[typography.caption, styles.biometricText]}>
                  {auth.biometrics.label}快捷解锁
                </Text>
              </PressableScale>
            ) : null}
          </Animated.View>

          <FadeIn delay={motion.stagger * motion.staggerMax}>
            <PressableScale
              accessibilityRole="button"
              onPress={fillDemoAccount}
              scale={0.98}
              pressedBg={colors.borderStrong}
              style={styles.demoCard}
            >
              <Feather name="info" size={layout.icon.sm} color={colors.text.secondary} />
              <Text style={[typography.caption, styles.demoText]}>
                演示账号：{DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}（点击填入）
              </Text>
            </PressableScale>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.baseWarm,
  },
  brand: {
    height: BRAND_HEIGHT,
    paddingHorizontal: layout.screenPadding,
    justifyContent: 'flex-start',
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
  brandTitle: {
    color: colors.text.inverse,
  },
  brandSlogan: {
    color: `${colors.text.inverse}CC`,
    marginTop: spacing.xxs,
  },
  formWrapper: {
    flex: 1,
    marginTop: -spacing.xl,
  },
  formContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  formCard: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  formTitle: {
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  field: {
    marginTop: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rememberText: {
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  link: {
    color: colors.primary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    marginLeft: spacing.xxs,
    flex: 1,
  },
  submit: {
    marginTop: spacing.lg,
  },
  biometric: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  biometricText: {
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg.subtle,
    borderRadius: radius.control,
  },
  demoText: {
    color: colors.text.secondary,
    marginLeft: spacing.xs,
    flex: 1,
  },
})
