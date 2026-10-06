/**
 * 职责：任务附件上传抽屉（增量 11 · M-P2-03）—— 拍照 / 从相册选择 / 选择文件 / 演示文件四入口，
 * 含权限降级、服务端可接收性预检、上传进度与失败重试。
 *
 * 设计要点：
 * - **设备能力全部关进适配层** `src/services/platform/attachmentPicker(.web).ts`，
 *   本组件**零** `expo-image-picker` / `expo-document-picker` import。
 * - `isSourceSupported('camera')` 在 Web 为 false ⇒ **不渲染**「拍照」入口。
 * - 校验**串联**：`validateAttachment`（≤20MB + 移动端白名单）→ `precheckServerAcceptability`（服务端口径）。
 * - 上传进度：mock 分支有真实 `onProgress` 序列 ⇒ `ProgressBar` + 百分比；
 *   真实分支 `fetch` 无上传进度 ⇒ `ActivityIndicator` 不确定态，**不伪造百分比**（架构裁决 M5）。
 * - 深色适配：样式工厂 `makeStyles(colors)` + `useThemedStyles`，颜色只取 `colors.*`。
 */
import { Feather } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/hooks'
import { taskService } from '@/services'
import { USE_MOCK } from '@/services/config'
import { isSourceSupported, pickFile, type PickSource } from '@/services/platform/attachmentPicker'
import { useTheme, useThemedStyles } from '@/store/ThemeProvider'
import { layout, radius, spacing, typography, type ThemeColors } from '@/theme'
import { getErrorMessage } from '@/types'
import type { AttachmentFileMeta } from '@/utils/attachment'
import { validateAttachment } from '@/utils/attachment'
import { precheckServerAcceptability } from '@/utils/attachmentServerPolicy'
import { formatBytes } from '@/utils/format'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { PressableScale } from './PressableScale'
import { ProgressBar } from './ProgressBar'

/** mock 文件选择器候选（仅 `USE_MOCK` 时渲染；覆盖合法 / 超限 / 非法类型三类样本） */
const MOCK_UPLOAD_FILES: AttachmentFileMeta[] = [
  { fileName: '评审结论.pdf', mimeType: 'application/pdf', sizeBytes: 1_240_000 },
  { fileName: '首页草图.png', mimeType: 'image/png', sizeBytes: 820_000 },
  {
    fileName: '会议纪要.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 96_000,
  },
  { fileName: '原始素材.zip', mimeType: 'application/zip', sizeBytes: 18_500_000 },
  { fileName: '超清录屏.mov', mimeType: 'video/quicktime', sizeBytes: 32_000_000 },
  { fileName: '安装包.exe', mimeType: 'application/x-msdownload', sizeBytes: 2_000_000 },
]

/** 抽屉阶段 */
type SheetPhase = 'idle' | 'permission' | 'uploading' | 'error'

/** 取图入口定义 */
interface PickEntry {
  source: PickSource
  icon: 'camera' | 'image' | 'file'
  title: string
  subtitle: string
}

const PICK_ENTRIES: PickEntry[] = [
  { source: 'camera', icon: 'camera', title: '拍照', subtitle: '调起系统相机拍摄照片' },
  { source: 'library', icon: 'image', title: '从相册选择', subtitle: '从系统相册选取图片' },
  { source: 'document', icon: 'file', title: '选择文件', subtitle: 'PDF / Office / ZIP，单文件 ≤20MB' },
]

/** 权限被拒时的中文说明（面向用户可读） */
const PERMISSION_MESSAGE: Record<'camera' | 'library', string> = {
  camera: '相机权限已被关闭 —— 需要在系统设置中开启「相机」权限后才能拍照。',
  library: '相册权限已被关闭 —— 需要在系统设置中开启「相册」权限后才能选择图片。',
}

export interface AttachmentUploadSheetProps {
  visible: boolean
  /** 目标任务 id（作为 `resource_id` 上传） */
  taskId: string
  /**
   * 租户 id（真实分支补齐上传响应用）。
   * 🔴 源头是 **`task.tenantId`**（由屏幕经 props 下传）—— 移动端 `User` **不含** `tenantId`，
   * 不要用 `useAuth().user.tenantId`（`src/types/user.ts:7-26`），那会 `tsc` 报错。
   */
  tenantId: string
  onClose: () => void
  /** 上传成功回调（由屏幕负责关闭抽屉并 refetch） */
  onUploaded: () => void
}

/** 任务附件上传抽屉 */
export function AttachmentUploadSheet({
  visible,
  taskId,
  tenantId,
  onClose,
  onUploaded,
}: AttachmentUploadSheetProps): React.JSX.Element {
  const { user } = useAuth()
  const { colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const userId = user?.id ?? ''

  const [phase, setPhase] = useState<SheetPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  /** 失败重试时保留上次文件，无需重拍 */
  const [pending, setPending] = useState<AttachmentFileMeta | null>(null)
  const [deniedSource, setDeniedSource] = useState<'camera' | 'library'>('camera')
  const [canAskAgain, setCanAskAgain] = useState(true)

  // 每次打开重置为入口态（照既有 `handleOpenUpload` 行为）
  useEffect(() => {
    if (!visible) return
    setPhase('idle')
    setProgress(0)
    setError(null)
    setHint(null)
    setPending(null)
    setCanAskAgain(true)
  }, [visible])

  /** 上传（串联两层校验；失败保留文件供重试） */
  const startUpload = useCallback(
    async (meta: AttachmentFileMeta) => {
      const validation = validateAttachment(meta)
      if (!validation.ok) {
        setPending(null)
        setError(validation.message)
        setHint(null)
        setPhase('error')
        return
      }
      const precheck = precheckServerAcceptability(meta)
      if (!precheck.ok) {
        setPending(null)
        setError(precheck.message)
        setHint(precheck.hint ?? null)
        setPhase('error')
        return
      }

      setPending(meta)
      setError(null)
      setHint(null)
      setProgress(0)
      setPhase('uploading')
      try {
        await taskService.uploadAttachment(taskId, meta, userId, (ratio) => setProgress(ratio), {
          tenantId,
        })
        setPhase('idle')
        setPending(null)
        setProgress(0)
        onUploaded()
      } catch (uploadError) {
        setError(getErrorMessage(uploadError))
        setPhase('error')
      }
    },
    [onUploaded, taskId, tenantId, userId],
  )

  /** 点按取图入口：调适配层 → 分派到权限态 / 失败态 / 上传 */
  const handlePick = useCallback(
    async (source: PickSource) => {
      const result = await pickFile(source, { quality: 0.7, allowsEditing: true })
      if (result.cancelled) return
      if (result.permissionDenied) {
        if (source !== 'document') setDeniedSource(source)
        setCanAskAgain(result.canAskAgain)
        setPhase('permission')
        return
      }
      // 适配层异常回落：既非「用户取消」、也没有文件 ⇒ 取图失败（不能静默什么都不做）
      if (!result.file) {
        setPending(null)
        setError('未能读取所选文件，请重新选择')
        setHint(null)
        setPhase('error')
        return
      }
      await startUpload(result.file)
    },
    [startUpload],
  )

  /** 上传中禁止关闭抽屉（保留既有行为） */
  const handleClose = useCallback(() => {
    if (phase === 'uploading') return
    onClose()
  }, [onClose, phase])

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="添加附件" heightRatio={0.72}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {phase === 'idle' ? (
          <Text style={[typography.caption, styles.sheetHint]}>
            单文件 ≤20MB，支持图片 / PDF / Office 文档 / ZIP
          </Text>
        ) : null}

        {/* ── 入口态：四入口动作行 ── */}
        {phase === 'idle' ? (
          <View style={styles.entryGroup}>
            {PICK_ENTRIES.filter((entry) => isSourceSupported(entry.source)).map((entry) => (
              <PressableScale
                key={entry.source}
                accessibilityRole="button"
                accessibilityLabel={entry.title}
                onPress={() => void handlePick(entry.source)}
                scale={1}
                pressedBg={colors.bg.subtle}
                style={styles.entryRow}
              >
                <Feather name={entry.icon} size={layout.icon.md} color={colors.primary} />
                <View style={styles.entryBody}>
                  <Text style={[typography.body, styles.entryTitle]}>{entry.title}</Text>
                  <Text style={[typography.caption, styles.entryMeta]} numberOfLines={1}>
                    {entry.subtitle}
                  </Text>
                </View>
                <Feather name="chevron-right" size={layout.icon.md} color={colors.text.tertiary} />
              </PressableScale>
            ))}
          </View>
        ) : null}

        {/* ── 演示文件（仅 mock 分支渲染，真实构建下不出现）── */}
        {phase === 'idle' && USE_MOCK ? (
          <View style={styles.mockGroup}>
            <Text style={[typography.caption, styles.mockTitle]}>演示文件</Text>
            {MOCK_UPLOAD_FILES.map((file) => (
              <PressableScale
                key={file.fileName}
                accessibilityRole="button"
                accessibilityLabel={`选择文件 ${file.fileName}`}
                onPress={() => void startUpload(file)}
                scale={1}
                pressedBg={colors.bg.subtle}
                style={styles.entryRow}
              >
                <Feather name="file" size={layout.icon.md} color={colors.text.secondary} />
                <View style={styles.entryBody}>
                  <Text style={[typography.body, styles.entryTitle]} numberOfLines={1}>
                    {file.fileName}
                  </Text>
                  <Text style={[typography.caption, styles.entryMeta]} numberOfLines={1}>
                    {file.mimeType} · {formatBytes(file.sizeBytes)}
                  </Text>
                </View>
                <Feather name="upload" size={layout.icon.md} color={colors.text.tertiary} />
              </PressableScale>
            ))}
          </View>
        ) : null}

        {/* ── 权限拒绝态 ── */}
        {phase === 'permission' ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={layout.icon.md} color={colors.warning} />
            <Text style={[typography.caption, styles.noticeText]}>
              {PERMISSION_MESSAGE[deniedSource]}
            </Text>
            <View style={styles.actions}>
              {canAskAgain ? (
                <Button
                  label="重试"
                  variant="secondary"
                  icon="refresh-cw"
                  onPress={() => void handlePick(deniedSource)}
                />
              ) : (
                <Button
                  label="去系统设置"
                  variant="secondary"
                  icon="settings"
                  onPress={() => void Linking.openSettings()}
                />
              )}
              <Button label="取消" variant="ghost" onPress={() => setPhase('idle')} />
            </View>
          </View>
        ) : null}

        {/* ── 上传中 ── */}
        {phase === 'uploading' ? (
          <View style={styles.notice}>
            <Text style={[typography.caption, styles.noticeText]} numberOfLines={1}>
              {pending?.fileName ?? ''}
            </Text>
            {USE_MOCK ? (
              <>
                <Text style={[typography.caption, styles.progressLabel]}>
                  上传中… {Math.round(progress * 100)}%
                </Text>
                <ProgressBar value={progress} />
              </>
            ) : (
              <View style={styles.indeterminateRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[typography.caption, styles.progressLabel]}>上传中…</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* ── 失败态 / 预检拦截态 ── */}
        {phase === 'error' ? (
          <View style={styles.notice}>
            <Feather name="alert-circle" size={layout.icon.md} color={colors.danger} />
            <Text style={[typography.caption, styles.errorText]}>{error}</Text>
            {hint ? <Text style={[typography.caption, styles.hintText]}>{hint}</Text> : null}
            <View style={styles.actions}>
              {pending ? (
                <Button
                  label="重试"
                  variant="secondary"
                  icon="refresh-cw"
                  onPress={() => void startUpload(pending)}
                />
              ) : null}
              <Button label="取消" variant="ghost" onPress={() => setPhase('idle')} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheetHint: {
      color: colors.text.tertiary,
      marginBottom: spacing.sm,
    },
    entryGroup: {
      marginBottom: spacing.md,
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.card,
    },
    entryBody: {
      flex: 1,
      minWidth: 0,
    },
    entryTitle: {
      color: colors.text.primary,
      fontWeight: '600',
    },
    entryMeta: {
      color: colors.text.tertiary,
      marginTop: spacing.xxs,
    },
    mockGroup: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
    mockTitle: {
      color: colors.text.tertiary,
      marginBottom: spacing.xs,
    },
    notice: {
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    noticeText: {
      color: colors.text.secondary,
    },
    errorText: {
      color: colors.danger,
    },
    hintText: {
      color: colors.text.tertiary,
    },
    progressLabel: {
      color: colors.text.secondary,
    },
    indeterminateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
  })
