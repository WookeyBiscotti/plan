import { useState, type DragEvent, type FormEvent, type MouseEvent } from 'react'
import { daysLabel } from './dates'
import { TrashIcon } from './icons'
import { usePlan } from './store'

export function Backlog() {
  const { state, schedule, addBacklog, unplace, remove, setDraggingId, setSelectedId, selectedId } =
    usePlan()
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState(5)

  const items = state.tasks.filter((t) => t.parentId === null && !t.start)

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
      </header>

      <ul className="backlog-list">
        {items.map((task) => {
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
