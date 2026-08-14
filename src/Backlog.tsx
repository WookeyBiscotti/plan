import { useMemo, useState, type DragEvent, type FormEvent, type MouseEvent } from 'react'
import { daysLabel } from './dates'
import { TrashIcon } from './icons'
import { TfsLink } from './TfsLink'
import { usePlan } from './store'

function matchesFilter(title: string, tfsId: number | undefined, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (title.toLowerCase().includes(needle)) return true
  if (tfsId != null && String(tfsId).includes(needle)) return true
  return false
}

export function Backlog() {
  const { state, schedule, addBacklog, unplace, remove, setDraggingId, setSelectedId, selectedId } =
    usePlan()
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState(5)
  const [filter, setFilter] = useState('')

  const items = useMemo(
    () => state.tasks.filter((t) => t.parentId === null && !t.start),
    [state.tasks],
  )

  const visible = useMemo(
    () => items.filter((task) => matchesFilter(task.title, task.tfsId, filter)),
    [items, filter],
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    addBacklog(title, estimate)
    setTitle('')
    setEstimate(5)
  }

  function onDragStart(event: DragEvent, taskId: string) {
    event.dataTransfer.setData('text/plain', taskId)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(taskId)
  }

  function onDropBack(event: DragEvent) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (id) unplace(id)
  }

  return (
    <aside
      className="backlog"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDropBack}
    >
      <header className="backlog-head">
        <h2>Входящие</h2>
        <p>Грубая оценка. Перетащите на дорожку, чтобы увидеть дату окончания.</p>
        {items.length > 0 && (
          <label className="backlog-filter">
            Поиск
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Название или ID"
            />
          </label>
        )}
      </header>

      <ul className="backlog-list">
        {visible.map((task) => {
          const kids = state.tasks.filter((t) => t.parentId === task.id).length
          return (
            <li key={task.id}>
              <div
                className={`backlog-card${selectedId === task.id ? ' is-selected' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, task.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setSelectedId(task.id)}
              >
                <div className="backlog-card-top">
                  <span className="backlog-title">{task.title}</span>
                  <div className="backlog-card-actions">
                    <TfsLink task={task} />
                    <button
                    type="button"
                    className="backlog-trash"
                    aria-label={`Удалить «${task.title}»`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      remove(task.id)
                    }}
                  >
                    <TrashIcon />
                  </button>
                  </div>
                </div>
                <span className="backlog-meta">
                  {daysLabel(task.estimateDays)}
                  {kids > 0 ? ` · ${kids} подзадач` : ''}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {items.length === 0 && (
        <p className="backlog-empty">Бэклог пуст — все крупные задачи уже на плане.</p>
      )}
      {items.length > 0 && visible.length === 0 && (
        <p className="backlog-empty">Ничего не найдено по «{filter.trim()}».</p>
      )}

      <form className="backlog-form" onSubmit={onSubmit}>
        <label>
          Новая крупная задача
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, биллинг v2"
          />
        </label>
        <label className="backlog-est">
          Оценка, дн
          <input
            type="number"
            min={1}
            max={60}
            value={estimate}
            onChange={(e) => setEstimate(Number(e.target.value))}
          />
        </label>
        <button type="submit">В бэклог</button>
      </form>

      {schedule.errors.length > 0 && (
        <p className="backlog-error">{schedule.errors[0]}</p>
      )}
    </aside>
  )
}
