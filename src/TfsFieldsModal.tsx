import { useEffect } from 'react'
import {
  formatFieldLabel,
  formatFieldValue,
  isLongField,
  listFieldEntries,
} from './tfsFieldView'
import type { Task } from './types'

type TfsFieldsModalProps = {
  task: Task | null
  onClose: () => void
}

export function TfsFieldsModal({ task, onClose }: TfsFieldsModalProps) {
  useEffect(() => {
    if (!task) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [task, onClose])

  if (!task?.tfsFields) return null

  const entries = listFieldEntries(task.tfsFields)
  const title = formatFieldValue('System.Title', task.tfsFields['System.Title'])
  const rawId = task.tfsId ?? task.tfsFields['System.Id']
  const id = rawId == null || rawId === '' ? '?' : String(rawId)

  return (
    <div className="tfs-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="tfs-modal" onClick={(event) => event.stopPropagation()}>
        <header className="tfs-modal-head">
          <div>
            <p className="eyebrow">Work item TFS</p>
            <h2>
              #{id} {title !== '—' ? title : task.title.replace(/^#\d+\s*/, '')}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="tfs-fields">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className={`tfs-field${isLongField(key, value) ? ' is-long' : ''}`}
            >
              <dt>{formatFieldLabel(key)}</dt>
              <dd>{formatFieldValue(key, value)}</dd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
