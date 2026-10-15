/**
 * 职责：输入框 —— 上浮标签 + focus 墨蓝描边 + 错误红字（ARCH §6 / §3.1）。
 * 标签浮起用 Animated 插值，输入区固定内边距，避免布局跳动。
 */
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { motion, radius, spacing, typography, type ThemeColors } from '@/theme'

/** TextField 入参 */
export interface TextFieldProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  error?: string | null
  secureTextEntry?: boolean
  keyboardType?: KeyboardTypeOptions
  autoFocus?: boolean
  editable?: boolean
  /** 右侧附加内容（如密码可见切换按钮） */
  right?: React.ReactNode
  /** 是否多行（评论输入用） */
  multiline?: boolean
  /** 最大长度 */
  maxLength?: number
  /** 提交回调（键盘回车） */
  onSubmitEditing?: () => void
}

/** 输入框高度（单行） */
const FIELD_HEIGHT = 56
/** 标签浮起 / 落下的位置 */
const LABEL_TOP_FLOATED = 7
const LABEL_TOP_RESTING = 19
/** 标签字号 */
const LABEL_SIZE_FLOATED = 12
const LABEL_SIZE_RESTING = 15

/** 输入框组件 */
export function TextField({
  label,
  value,
  onChangeText,
  error = null,
  secureTextEntry = false,
  keyboardType,
  autoFocus = false,
  editable = true,
  right,
  multiline = false,
  maxLength,
  onSubmitEditing,
}: TextFieldProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [focused, setFocused] = useState(false)
  const floatAnim = useRef(new Animated.Value(value ? 1 : 0)).current
  const floated = focused || value.length > 0

  useEffect(() => {
    Animated.timing(floatAnim, {
      toValue: floated ? 1 : 0,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: false,
    }).start()
  }, [floatAnim, floated])

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.borderStrong
  const labelColor = error ? colors.danger : focused ? colors.primary : colors.text.secondary

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : styles.fieldSingle,
          { borderColor },
        ]}
      >
        <Animated.Text
          style={[
            styles.label,
            {
              color: labelColor,
              top: floatAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [LABEL_TOP_RESTING, LABEL_TOP_FLOATED],
              }),
              fontSize: floatAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [LABEL_SIZE_RESTING, LABEL_SIZE_FLOATED],
              }),
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          onSubmitEditing={onSubmitEditing}
          placeholderTextColor={colors.text.tertiary}
          selectionColor={colors.primary}
          style={[styles.input, multiline ? styles.inputMultiline : styles.inputSingle]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {error ? (
        <Text style={[typography.caption, styles.error]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      width: '100%',
    },
    field: {
      backgroundColor: colors.bg.surface,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: 'center',
    },
    fieldSingle: {
      height: FIELD_HEIGHT,
    },
    fieldMultiline: {
      minHeight: FIELD_HEIGHT * 1.6,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    label: {
      position: 'absolute',
      left: spacing.sm + spacing.xxs,
      fontWeight: '600',
      letterSpacing: typography.label.letterSpacing,
    },
    input: {
      ...typography.body,
      color: colors.text.primary,
      paddingHorizontal: spacing.sm + spacing.xxs,
      paddingRight: spacing.xxl,
    },
    inputSingle: {
      height: FIELD_HEIGHT,
      paddingTop: spacing.lg,
    },
    inputMultiline: {
      paddingTop: spacing.md,
      textAlignVertical: 'top',
      minHeight: FIELD_HEIGHT,
    },
    right: {
      position: 'absolute',
      right: spacing.sm,
      height: '100%',
      justifyContent: 'center',
    },
    error: {
      color: colors.danger,
      marginTop: spacing.xxs,
      marginLeft: spacing.xxs,
    },
  })
