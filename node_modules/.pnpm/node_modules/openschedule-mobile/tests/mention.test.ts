/**
 * 职责：@提及解析与通知生成单元测试（D-01）。
 * 覆盖：@显示名解析（offset/length）、未匹配兜底、去重、发送评论后为被提及者生成通知。
 */
import { DEMO_USER_IDS, db, resetDatabase } from '@/data'
import * as taskService from '@/services/task.service'
import * as focusService from '@/services/focus.service'
import type { CommentMention } from '@/services/task.service'
import type { User } from '@/types'

const ME = DEMO_USER_IDS.me // 张伟
const LINA = DEMO_USER_IDS.lina // 李娜
const WANG = DEMO_USER_IDS.wangqiang // 王强

beforeEach(() => {
  resetDatabase()
})

describe('parseMentions —— @提及解析', () => {
  it('解析出 @显示名 对应用户，并给出 offset / length', () => {
    const content = '请 @李娜 和 @王强 一起看下'
    const mentions = taskService.parseMentions(content, db.users)
    expect(mentions.map((item) => item.userId)).toEqual([LINA, WANG])
    // offset 指向 '@' 在正文中的位置，length 为 displayName 长度（不含 '@'）
    expect(mentions[0].offset).toBe(content.indexOf('@'))
    expect(mentions[0].length).toBe('李娜'.length)
    expect(mentions[1].offset).toBe(content.lastIndexOf('@'))
  })

  it('无 @ 或未匹配到任何用户时返回空数组', () => {
    expect(taskService.parseMentions('这是一条普通评论', db.users)).toEqual([])
    expect(taskService.parseMentions('@不存在的人 你好', db.users)).toEqual([])
  })

  it('同一用户重复提及只保留首次', () => {
    const mentions = taskService.parseMentions('@张伟 先看下，@张伟 再确认', db.users)
    expect(mentions.filter((item) => item.userId === ME)).toHaveLength(1)
  })
})

describe('addComment —— @提及触发通知', () => {
  it('为每个被提及者生成 mention 通知，data.taskId 指向当前任务', async () => {
    const before = db.notifications.length
    const comment = await taskService.addComment('task-001', { content: '请 @李娜 帮忙确认，@王强 同步下' }, ME)
    const mentions = comment.mentions as CommentMention[]
    expect(mentions.map((item) => item.userId).sort()).toEqual([LINA, WANG].sort())
    expect(db.notifications.length).toBe(before + 2)

    // 新通知位于队首（unshift）
    const created = db.notifications.slice(0, db.notifications.length - before)
    created.forEach((notification) => {
      expect(notification.type).toBe('mention')
      expect(notification.data?.taskId).toBe('task-001')
      expect(notification.readAt).toBeNull()
    })

    const linaNotification = created.find((item) => item.userId === LINA)
    expect(linaNotification?.title).toContain('张伟')
    expect(linaNotification?.title).toContain('提到了你')
    expect(linaNotification?.title).toContain('任务')
  })

  it('自提及（@自己）不生成通知', async () => {
    const before = db.notifications.length
    await taskService.addComment('task-001', { content: '记录一下 @张伟 的备注' }, ME)
    expect(db.notifications.length).toBe(before)
  })

  it('无提及时不产生通知', async () => {
    const before = db.notifications.length
    await taskService.addComment('task-001', { content: '这是一条普通评论' }, ME)
    expect(db.notifications.length).toBe(before)
  })

  it('被提及者能在「通知列表」中读到该条 mention 通知（端到端，而非仅看库长度）', async () => {
    await taskService.addComment('task-001', { content: '请 @李娜 帮忙确认' }, ME)
    const list = await focusService.listNotifications(LINA)
    const mention = list.find((item) => item.type === 'mention' && item.data?.taskId === 'task-001')
    expect(mention).toBeDefined()
    expect(mention?.userId).toBe(LINA)
    expect(mention?.readAt).toBeNull()
    expect(mention?.title).toContain('张伟')
    expect(mention?.title).toContain('提到了你')
  })

  it('提及两个不同用户时，双方各自都能在通知列表读到（互不串号）', async () => {
    await taskService.addComment('task-001', { content: '@李娜 与 @王强 都看下' }, ME)
    const linaList = await focusService.listNotifications(LINA)
    const wangList = await focusService.listNotifications(WANG)
    expect(linaList.some((item) => item.data?.taskId === 'task-001' && item.type === 'mention')).toBe(true)
    expect(wangList.some((item) => item.data?.taskId === 'task-001' && item.type === 'mention')).toBe(true)
    // 交叉校验：李娜的通知不应出现在王强的列表里
    const linaIds = new Set(linaList.map((item) => item.id))
    expect(wangList.filter((item) => linaIds.has(item.id))).toHaveLength(0)
  })
})

describe('parseMentions —— 边界补强（重名 / 长名优先 / 空文本）', () => {
  it('重名用户只解析出一次，且确定性地取用户列表中靠前者', () => {
    const dupUsers: User[] = [
      { ...db.users[0], id: 'dup-a', displayName: '李娜' },
      { ...db.users[1], id: 'dup-b', displayName: '李娜' },
    ]
    const mentions = taskService.parseMentions('请 @李娜 看下', dupUsers)
    expect(mentions).toHaveLength(1)
    expect(mentions[0].userId).toBe('dup-a')
  })

  it('长名优先：同时存在「李」与「李娜」时，@李娜 命中「李娜」而非「李」', () => {
    const users: User[] = [
      { ...db.users[0], id: 'short', displayName: '李' },
      { ...db.users[1], id: 'long', displayName: '李娜' },
    ]
    const mentions = taskService.parseMentions('@李娜 你好', users)
    expect(mentions.map((item) => item.userId)).toEqual(['long'])
    expect(mentions[0].length).toBe('李娜'.length)
  })

  it('空文本 / 纯空白 / 仅一个 @ 均返回空数组', () => {
    expect(taskService.parseMentions('', db.users)).toEqual([])
    expect(taskService.parseMentions('   ', db.users)).toEqual([])
    expect(taskService.parseMentions('@', db.users)).toEqual([])
  })

  it('@ 后为空白再跟显示名时不误匹配（要求紧邻）', () => {
    expect(taskService.parseMentions('@ 李娜 你好', db.users)).toEqual([])
  })
})
