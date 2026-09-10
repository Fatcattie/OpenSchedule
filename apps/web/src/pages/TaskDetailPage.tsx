/**
 * TaskDetailPage —— 任务详情页入口
 *
 * 任务详情页与执行页合并后，本页仅保留路由入口，实际渲染交给 TaskExecutionPanel。
 * 入口 URL 保持不变：/tasks/:taskId
 */
import { useParams } from 'react-router-dom'
import TaskExecutionPanel from '@/components/TaskExecutionPanel'

export default function TaskDetailPage() {
  const { taskId = '' } = useParams()
  return <TaskExecutionPanel taskId={taskId} />
}
