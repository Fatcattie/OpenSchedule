/**
 * 职责：关于页 —— 产品信息 / 技术栈 / 首版能力范围与已知限制。
 */
import { Feather } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BrandGradient, Card, FadeIn, ScreenHeader, Tag, staggerDelay } from '@/components'
import type { TranslationKey } from '@/i18n'
import { useT } from '@/store/I18nProvider'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import type { AppNavigationProp } from '@/types'

/** 首版核心能力（键；zh 输出与改造前逐字一致） */
const FEATURES: TranslationKey[] = [
  'screens.core.about.feature1',
  'screens.core.about.feature2',
  'screens.core.about.feature3',
  'screens.core.about.feature4',
  'screens.core.about.feature5',
  'screens.core.about.feature6',
]

/** 技术栈（键） */
const STACK: TranslationKey[] = [
  'screens.core.about.stack1',
  'screens.core.about.stack2',
  'screens.core.about.stack3',
  'screens.core.about.stack4',
]

/** 已知限制（键） */
const LIMITS: TranslationKey[] = [
  'screens.core.about.limit1',
  'screens.core.about.limit2',
  'screens.core.about.limit3',
  'screens.core.about.limit4',
]

/** 关于页 */
export function AboutScreen(): React.JSX.Element {
  const navigation = useNavigation<AppNavigationProp>()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const t = useT()

  return (
    <View style={styles.root}>
      <ScreenHeader title={t('screens.core.about.title')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <BrandGradient direction="vertical" style={styles.banner}>
            <View style={styles.logo}>
              <Feather name="calendar" size={layout.icon.lg + spacing.xxs} color={colors.text.inverse} />
            </View>
            <Text style={[typography.display, styles.brandName]}>OpenSchedule</Text>
            <Text style={[typography.caption, styles.brandSlogan]}>
              {t('screens.core.about.slogan')}
            </Text>
            <View style={styles.versionRow}>
              <Tag text="v1.0.0" tone="neutral" />
              <View style={styles.versionGap} />
              <Tag text={t('screens.core.about.version')} tone="neutral" />
            </View>
          </BrandGradient>
        </FadeIn>

        <FadeIn delay={staggerDelay(1)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>
            {t('screens.core.about.featuresTitle')}
          </Text>
          <Card>
            {FEATURES.map((featureKey, index) => (
              <View
                key={featureKey}
                style={[styles.listRow, index < FEATURES.length - 1 ? styles.listDivider : null]}
              >
                <Feather name="check" size={layout.icon.sm} color={colors.success} />
                <Text style={[typography.body, styles.listText]}>{t(featureKey)}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={staggerDelay(2)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>
            {t('screens.core.about.stackTitle')}
          </Text>
          <Card>
            {STACK.map((stackKey, index) => (
              <View
                key={stackKey}
                style={[styles.listRow, index < STACK.length - 1 ? styles.listDivider : null]}
              >
                <Feather name="cpu" size={layout.icon.sm} color={colors.text.secondary} />
                <Text style={[typography.body, styles.listText]}>{t(stackKey)}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={staggerDelay(3)} style={styles.section}>
          <Text style={[typography.title, styles.sectionTitle]}>
            {t('screens.core.about.limitsTitle')}
          </Text>
          <Card>
            {LIMITS.map((limitKey, index) => (
              <View
                key={limitKey}
                style={[styles.listRow, index < LIMITS.length - 1 ? styles.listDivider : null]}
              >
                <Feather name="info" size={layout.icon.sm} color={colors.warning} />
                <Text style={[typography.caption, styles.listText]}>{t(limitKey)}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <Text style={[typography.caption, styles.footer]}>
          {t('screens.core.about.footer')}
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
