import { useMemo, useState, type DragEvent, type FormEvent, type MouseEvent } from 'react'
import { daysLabel } from './dates'
import { TrashIcon } from './icons'
import { TfsLink } from './TfsLink'
import { usePlan } from './store'
import { matchesRoadmapState, matchesTaskSearch, taskRoadmapState } from './taskFilter'
import { canPlaceOnTimeline, isTaskEstimated } from './taskEstimate'

type BacklogProps = {
  width: number
}

export function Backlog({ width }: BacklogProps) {
  const { state, schedule, addBacklog, unplace, remove, setDraggingId, setSelectedId, selectedId } =
    usePlan()
  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('')
  const [filter, setFilter] = useState('')
  const [roadmapState, setRoadmapState] = useState('')

  const items = useMemo(
    () => state.tasks.filter((t) => t.parentId === null && !t.start),
    [state.tasks],
  )

  const roadmapStates = useMemo(() => {
    const values = new Set<string>()
    for (const task of items) {
      const value = taskRoadmapState(task)
      if (value) values.add(value)
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items])

  const visible = useMemo(
    () =>
      items.filter(
        (task) => matchesTaskSearch(task, filter) && matchesRoadmapState(task, roadmapState),
      ),
    [items, filter, roadmapState],
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const parsed = estimate.trim() ? Number.parseInt(estimate, 10) : 0
    addBacklog(title, Number.isFinite(parsed) ? parsed : 0)
    setTitle('')
    setEstimate('')
  }

  function onDragStart(event: DragEvent, taskId: string) {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task || !canPlaceOnTimeline(task)) {
      event.preventDefault()
      return
    }
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
      style={{ width, flex: 'none' }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDropBack}
    >
      <header className="backlog-head">
        <h2>Входящие</h2>
        <p>Задачи без оценки нельзя перетащить на таймлайн — сначала укажите длительность.</p>
        {items.length > 0 && (
          <div className="backlog-filters">
            <label className="backlog-filter">
              Поиск
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Название, ID или State: значение"
              />
            </label>
            {roadmapStates.length > 0 && (
              <label className="backlog-filter">
                Roadmap State
                <select
                  value={roadmapState}
                  onChange={(e) => setRoadmapState(e.target.value)}
                >
                  <option value="">Все</option>
                  {roadmapStates.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </header>

      <ul className="backlog-list">
        {visible.map((task) => {
          const kids = state.tasks.filter((t) => t.parentId === task.id).length
          const estimated = isTaskEstimated(task)
          return (
            <li key={task.id}>
              <div
                className={`backlog-card${selectedId === task.id ? ' is-selected' : ''}${estimated ? '' : ' is-unestimated'}`}
                draggable={estimated}
                onDragStart={(e) => onDragStart(e, task.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setSelectedId(task.id)}
              >
                <div className="backlog-card-top">
                  <span className="backlog-title">{task.title}</span>
                  <div className="backlog-card-actions">
                    {!estimated && <span className="unestimated-badge">Без оценки</span>}
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
                  {estimated
                    ? `${daysLabel(task.estimateDays)}${task.estimateHours != null ? ` · ${task.estimateHours} ч` : ''}`
                    : 'Укажите оценку в панели справа'}
                  {kids > 0 ? ` · ${kids} подзадач${task.hideSubtasks ? ' (скрыты)' : ''}` : ''}
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
        <p className="backlog-empty">
          Ничего не найдено
          {filter.trim() ? ` по «${filter.trim()}»` : ''}
          {roadmapState ? ` · Roadmap State: ${roadmapState}` : ''}.
        </p>
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
            min={0}
            max={60}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="необяз."
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
