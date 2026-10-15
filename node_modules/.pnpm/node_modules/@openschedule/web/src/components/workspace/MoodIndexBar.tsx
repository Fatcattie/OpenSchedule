/**
 * MoodIndexBar —— 心情指数栏
 *
 * 三个 emoji（开心/一般/郁闷）每日可选一个点亮，
 * 点亮后弹出五星评分，保存当天心情并显示鼓励语。
 */
import { useState } from 'react'
import { Button, Modal, Rate, Space, Tag, Typography, message } from 'antd'
import { useLocalStorageState } from '@/hooks/useLocalStorageState'
import {
  MOOD_EMOJI_META,
  MOOD_STORAGE_KEY,
  type MoodEmoji,
  type MoodEntry,
  encourageFor,
  findTodayMood,
} from '@/utils/mood'

const { Text } = Typography

export default function MoodIndexBar() {
  const [entries, setEntries] = useLocalStorageState<MoodEntry[]>(MOOD_STORAGE_KEY, [])
  const todayMood = findTodayMood(entries)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEmoji, setSelectedEmoji] = useState<MoodEmoji | null>(null)
  const [stars, setStars] = useState<number>(3)

  const handleEmojiClick = (emoji: MoodEmoji) => {
    setSelectedEmoji(emoji)
    setStars(3)
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!selectedEmoji) return
    const date = new Date().toISOString().slice(0, 10)
    const next: MoodEntry = {
      date,
      emoji: selectedEmoji,
      stars,
      ts: new Date().toISOString(),
    }
    setEntries((c) => {
      const filtered = c.filter((e) => e.date !== date)
      return [next, ...filtered]
    })
    setModalOpen(false)
    message.success('今日心情已记录')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {todayMood ? (
        <>
          <Tag
            color={MOOD_EMOJI_META[todayMood.emoji].color}
            style={{ fontSize: 14, padding: '4px 10px', borderRadius: 16 }}
          >
            <span style={{ marginRight: 6 }}>{MOOD_EMOJI_META[todayMood.emoji].icon}</span>
            今日心情：{MOOD_EMOJI_META[todayMood.emoji].label}
            <Rate
              count={5}
              value={todayMood.stars}
              disabled
              style={{ fontSize: 13, marginLeft: 8 }}
            />
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {encourageFor(todayMood.emoji, todayMood.stars)}
          </Text>
          <Button type="link" size="small" onClick={() => handleEmojiClick(todayMood.emoji)}>
            修改
          </Button>
        </>
      ) : (
        <>
          <Text type="secondary" style={{ fontSize: 13 }}>
            今天心情如何？
          </Text>
          <Space>
            {(['happy', 'normal', 'gloom'] as MoodEmoji[]).map((emoji) => {
              const meta = MOOD_EMOJI_META[emoji]
              return (
                <Button
                  key={emoji}
                  shape="circle"
                  size="small"
                  title={meta.label}
                  onClick={() => handleEmojiClick(emoji)}
                  style={{ fontSize: 20, width: 38, height: 38 }}
                >
                  {meta.icon}
                </Button>
              )
            })}
          </Space>
        </>
      )}

      <Modal
        title="今日心情指数"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>
            {selectedEmoji && MOOD_EMOJI_META[selectedEmoji].icon}
          </div>
          <Text style={{ fontSize: 16, display: 'block', marginBottom: 16 }}>
            {selectedEmoji && MOOD_EMOJI_META[selectedEmoji].label}
          </Text>
          <Rate count={5} value={stars} onChange={setStars} style={{ fontSize: 28 }} />
          <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
            {selectedEmoji && encourageFor(selectedEmoji, stars)}
          </Text>
        </div>
      </Modal>
    </div>
  )
}
