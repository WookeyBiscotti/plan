import { taskTfsId, taskTfsUrl } from './tfsLink'
import type { Task } from './types'

type TfsLinkProps = {
  task: Task
  className?: string
  label?: string
}

export function TfsLink({ task, className = 'tfs-link', label = 'TFS ↗' }: TfsLinkProps) {
  const url = taskTfsUrl(task)
  if (!url) return null

  const id = taskTfsId(task)
  return (
    <a
      className={className}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={id != null ? `Открыть #${id} в TFS` : 'Открыть в TFS'}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  )
}
