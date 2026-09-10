/**
 * TaskExecutionPage —— 任务执行页入口
 *
 * 任务详情页与执行页合并后，本页仅保留路由入口，实际渲染交给 TaskExecutionPanel。
 */
import { useParams } from 'react-router-dom'
import TaskExecutionPanel from '@/components/TaskExecutionPanel'

export default function TaskExecutionPage() {
  const { taskId = '' } = useParams()
  return <TaskExecutionPanel taskId={taskId} />
}
