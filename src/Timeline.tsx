import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import {
  daysLabel,
  formatDay,
  isWeekend,
  monthLabel,
  parseISO,
  rangeDays,
  todayISO,
  toISO,
  weekdayLetter,
  workDates,
} from './dates'
import { usePlan, useRootSelected } from './store'
import { TrashIcon, LockIcon } from './icons'
import { TfsLink } from './TfsLink'
import type { EpicStats, Id, Person, Placement, Task } from './types'
import { hasExternalBlockers } from './tfsImport'

export const DAY_W = 34
export const LABEL_W = 176
export const LANE_H = 56
export const EPIC_ROW_H = 44
const TIMELINE_DAYS = 70

type EpicItem = {
  task: Task
  span: { start: string; end: string }
  stats?: EpicStats
}

function spansOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end
}

function assignEpicRows(items: EpicItem[]): EpicItem[][] {
  if (items.length === 0) return []

  const sorted = [...items].sort(
    (a, b) => a.span.start.localeCompare(b.span.start) || a.task.id.localeCompare(b.task.id),
  )
  const rows: EpicItem[][] = []

  for (const item of sorted) {
    let row = rows.find((lane) => lane.every((other) => !spansOverlap(item.span, other.span)))
    if (!row) {
      row = []
      rows.push(row)
    }
    row.push(item)
  }

  return rows
}

function dateFromPoint(body: HTMLElement, clientX: number, days: Date[]): string {
  const rect = body.getBoundingClientRect()
  const x = clientX - rect.left
  const index = Math.min(days.length - 1, Math.max(0, Math.floor(x / DAY_W)))
  return toISO(days[index])
}

function barStyle(days: Date[], start: string, end: string) {
  const startI = days.findIndex((d) => toISO(d) === start)
  const endI = days.findIndex((d) => toISO(d) === end)
  if (startI < 0 || endI < 0) return null
  return {
    left: startI * DAY_W + 3,
    width: Math.max(DAY_W - 6, (endI - startI + 1) * DAY_W - 6),
  }
}

function epicSpan(task: Task): { start: string; end: string } | null {
  if (!task.start) return null
  const end = workDates(parseISO(task.start), Math.max(1, task.estimateDays)).at(-1)
  if (!end) return null
  return { start: task.start, end }
}

function personById(people: Person[], id: Id | null) {
  return people.find((p) => p.id === id) ?? null
}

export function Timeline() {
  const {
    state,
    schedule,
    draggingId,
    hover,
    setHover,
    setDraggingId,
    place,
    moveEpicStart,
    setSelectedId,
    selectedId,
  } = usePlan()
  const rootSelected = useRootSelected()
  const scroller = useRef<HTMLDivElement>(null)
  const epicBodies = useRef<Map<number, HTMLElement>>(new Map())
  const [epicHoverDate, setEpicHoverDate] = useState<string | null>(null)
  const [epicMove, setEpicMove] = useState<{ taskId: Id; date: string } | null>(null)
  const days = useMemo(() => rangeDays(state.planStart, TIMELINE_DAYS), [state.planStart])
  const today = todayISO()
  const todayIndex = days.findIndex((d) => toISO(d) === today)
  const width = days.length * DAY_W

  useEffect(() => {
    const el = scroller.current
    if (!el || todayIndex < 0) return
    el.scrollLeft = Math.max(0, todayIndex * DAY_W - 120)
  }, [todayIndex])

  const dragging = state.tasks.find((t) => t.id === draggingId) ?? null
  const draggingRoot = dragging && dragging.parentId === null ? dragging : null
  const ghost = hover && dragging ? workDates(parseISO(hover.date), dragging.estimateDays) : null
  const epicGhostDates =
    epicHoverDate && draggingRoot
      ? workDates(parseISO(epicHoverDate), draggingRoot.estimateDays)
      : null
  const epicMoveDates = epicMove
    ? workDates(
        parseISO(epicMove.date),
        Math.max(1, state.tasks.find((t) => t.id === epicMove.taskId)?.estimateDays ?? 1),
      )
    : null

  const monthGroups = useMemo(() => {
    const groups: { label: string; count: number }[] = []
    for (const day of days) {
      const label = `${monthLabel(day)} ${day.getFullYear()}`
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.count += 1
      else groups.push({ label, count: 1 })
    }
    return groups
  }, [days])

  const leafPlacements = Object.values(schedule.placements)

  const epicRows = useMemo(() => {
    const epicTasks = state.tasks.filter(
      (t) => t.parentId === null && t.start && state.tasks.some((c) => c.parentId === t.id),
    )
    const items: EpicItem[] = []
    for (const task of epicTasks) {
      const stats = schedule.stats[task.id]
      const span = epicSpan(task)
      if (!span) continue
      items.push({ task, span, stats })
    }
    return assignEpicRows(items)
  }, [state.tasks, schedule.stats])

  useEffect(() => {
    if (!draggingId) setEpicHoverDate(null)
  }, [draggingId])

  useEffect(() => {
    if (!epicMove) return

    function onPointerMove(event: globalThis.PointerEvent) {
      const bodies = [...epicBodies.current.values()]
      const body = bodies.find((node) => {
        const rect = node.getBoundingClientRect()
        return event.clientX >= rect.left && event.clientX <= rect.right
      })
      if (!body) return
      setEpicMove((prev) =>
        prev ? { ...prev, date: dateFromPoint(body, event.clientX, days) } : null,
      )
    }

    function onPointerUp() {
      setEpicMove((prev) => {
        if (prev) moveEpicStart(prev.taskId, prev.date)
        return null
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [epicMove, days, moveEpicStart])

  function epicDateFromEvent(event: DragEvent<HTMLElement> | React.DragEvent<HTMLElement>) {
    const body = event.currentTarget
    return dateFromPoint(body, event.clientX, days)
  }

  function onEpicDragOver(event: DragEvent<HTMLElement>) {
    if (!draggingRoot) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setEpicHoverDate(epicDateFromEvent(event))
  }

  function onEpicDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    if (!id) return
    const task = state.tasks.find((t) => t.id === id)
    if (!task || task.parentId) return
    const date = epicDateFromEvent(event)
    const personId = task.assigneeId ?? state.people[0]?.id
    if (!personId) return
    place(id, personId, date)
    setEpicHoverDate(null)
  }

  function beginEpicMove(event: PointerEvent<HTMLButtonElement>, taskId: Id, start: string) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setEpicMove({ taskId, date: start })
    setSelectedId(taskId)
  }

  function onLaneDrag(event: DragEvent<HTMLElement>, personId: Id) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const body = event.currentTarget.querySelector('.lane-body')
    if (!(body instanceof HTMLElement) || !draggingId) return
    setHover({ personId, date: dateFromPoint(body, event.clientX, days) })
  }

  function onLaneDrop(event: DragEvent<HTMLElement>, personId: Id) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    const body = event.currentTarget.querySelector('.lane-body')
    if (!id || !(body instanceof HTMLElement)) return
    place(id, personId, dateFromPoint(body, event.clientX, days))
  }

  function startDrag(event: DragEvent, taskId: Id) {
    event.dataTransfer.setData('text/plain', taskId)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(taskId)
    setSelectedId(taskId)
  }

  return (
    <section className="timeline" ref={scroller}>
      <div className="timeline-inner" style={{ minWidth: LABEL_W + width }}>
        <div className="axis">
          <div className="lane-label axis-corner">Исполнитель</div>
          <div className="axis-body" style={{ width }}>
            <div className="axis-months">
              {monthGroups.map((g) => (
                <div key={g.label} className="axis-month" style={{ width: g.count * DAY_W }}>
                  {g.label}
                </div>
              ))}
            </div>
            <div className="axis-days">
              {days.map((day) => {
                const iso = toISO(day)
                return (
                  <div
                    key={iso}
                    className={`axis-day${isWeekend(day) ? ' is-weekend' : ''}${iso === today ? ' is-today' : ''}`}
                    style={{ width: DAY_W }}
                  >
                    <span>{weekdayLetter(day)}</span>
                    <strong>{formatDay(day)}</strong>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {(epicRows.length > 0 ? epicRows : [[]]).map((row, rowIndex) => (
          <div key={rowIndex} className="epics">
            <div className="lane-label">{rowIndex === 0 ? 'Эпики' : ''}</div>
            <div
              className="lane-body epics-body"
              style={{ width, height: EPIC_ROW_H }}
              ref={(node) => {
                if (node) epicBodies.current.set(rowIndex, node)
                else epicBodies.current.delete(rowIndex)
              }}
              onDragOver={onEpicDragOver}
              onDragLeave={() => setEpicHoverDate(null)}
              onDrop={onEpicDrop}
            >
              {days.map((day) => (
                <span
                  key={toISO(day)}
                  className={`grid-cell${isWeekend(day) ? ' is-weekend' : ''}${toISO(day) === today ? ' is-today' : ''}`}
                />
              ))}
              {epicGhostDates && (
                <div
                  className="ghost-bar epic-ghost"
                  style={
                    barStyle(days, epicGhostDates[0], epicGhostDates[epicGhostDates.length - 1]) ??
                    undefined
                  }
                />
              )}
              {epicMoveDates && row.some(({ task }) => task.id === epicMove?.taskId) && (
                <div
                  className="ghost-bar epic-ghost is-moving"
                  style={
                    barStyle(days, epicMoveDates[0], epicMoveDates[epicMoveDates.length - 1]) ??
                    undefined
                  }
                />
              )}
              {row.map(({ task, span, stats }) => {
                const box = barStyle(days, span.start, span.end)
                if (!box) return null
                const kids = state.tasks.filter((t) => t.parentId === task.id)
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`epic-bar${rootSelected === task.id ? ' is-selected' : ''}${epicMove?.taskId === task.id ? ' is-moving' : ''}`}
                    style={{
                      left: box.left,
                      width: box.width,
                      opacity: epicMove?.taskId === task.id ? 0.35 : 1,
                    }}
                    onPointerDown={(e) => beginEpicMove(e, task.id, span.start)}
                    onClick={() => setSelectedId(task.id)}
                  >
                    <span>{task.title}</span>
                    <TfsLink task={task} className="tfs-link tfs-link-inline" />
                    <em>
                      {kids.length > 0 && stats
                        ? `${stats.spanDays}д / ${stats.sumParts}д`
                        : daysLabel(task.estimateDays)}
                    </em>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="lanes">
          {todayIndex >= 0 && (
            <div
              className="today-line"
              style={{ left: LABEL_W + todayIndex * DAY_W }}
            />
          )}
          {state.people.map((person) => (
            <Lane
              key={person.id}
              person={person}
              days={days}
              today={today}
              width={width}
              placements={leafPlacements.filter((p) => p.assigneeId === person.id)}
              tasks={state.tasks}
              people={state.people}
              selectedId={selectedId}
              rootSelected={rootSelected}
              critical={rootSelected ? schedule.stats[rootSelected]?.critical ?? [] : []}
              ghost={hover?.personId === person.id ? ghost : null}
              onDragOver={onLaneDrag}
              onDrop={onLaneDrop}
              onDragStart={startDrag}
              onDragEnd={() => setDraggingId(null)}
              onSelect={setSelectedId}
            />
          ))}
          {rootSelected && (
            <DependencyArrows
              days={days}
              people={state.people}
              tasks={state.tasks.filter((t) => t.parentId === rootSelected)}
              placements={schedule.placements}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function Lane({
  person,
  days,
  today,
  width,
  placements,
  tasks,
  people,
  selectedId,
  rootSelected,
  critical,
  ghost,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onSelect,
}: {
  person: Person
  days: Date[]
  today: string
  width: number
  placements: Placement[]
  tasks: Task[]
  people: Person[]
  selectedId: Id | null
  rootSelected: Id | null
  critical: Id[]
  ghost: string[] | null
  onDragOver: (event: DragEvent<HTMLElement>, personId: Id) => void
  onDrop: (event: DragEvent<HTMLElement>, personId: Id) => void
  onDragStart: (event: DragEvent, taskId: Id) => void
  onDragEnd: () => void
  onSelect: (id: Id) => void
}) {
  const { patchPerson, removePerson } = usePlan()
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ghostBox =
    ghost && ghost.length > 0 ? barStyle(days, ghost[0], ghost[ghost.length - 1]) : null

  return (
    <div
      className="lane"
      onDragOver={(e) => onDragOver(e, person.id)}
      onDrop={(e) => onDrop(e, person.id)}
    >
      <div className="lane-label">
        <span className="swatch" style={{ background: person.color }} />
        <span className="lane-fields">
          <input
            className="lane-name"
            aria-label="Имя"
            value={person.name}
            onChange={(e) => patchPerson(person.id, { name: e.target.value })}
            onBlur={() => {
              if (!person.name.trim()) patchPerson(person.id, { name: 'Исполнитель' })
            }}
          />
          <input
            className="lane-role"
            aria-label="Роль"
            value={person.role}
            onChange={(e) => patchPerson(person.id, { role: e.target.value })}
            onBlur={() => {
              if (!person.role.trim()) patchPerson(person.id, { role: 'Dev' })
            }}
          />
        </span>
        <button
          type="button"
          className="lane-trash"
          aria-label={`Удалить ${person.name}`}
          title="Удалить из команды"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            removePerson(person.id)
          }}
        >
          <TrashIcon />
        </button>
      </div>
      <div className="lane-body" style={{ width, height: LANE_H }}>
        {days.map((day) => (
          <span
            key={toISO(day)}
            className={`grid-cell${isWeekend(day) ? ' is-weekend' : ''}${toISO(day) === today ? ' is-today' : ''}`}
          />
        ))}
        {ghostBox && (
          <div className="ghost-bar" style={{ left: ghostBox.left, width: ghostBox.width }} />
        )}
        {placements.map((placement) => {
          const task = byId.get(placement.taskId)
          if (!task) return null
          const box = barStyle(days, placement.start, placement.end)
          if (!box) return null
          const color = personById(people, placement.assigneeId)?.color ?? person.color
          const isCrit = critical.includes(task.id)
          const inEpic = rootSelected && (task.id === rootSelected || task.parentId === rootSelected)
          const locked = hasExternalBlockers(task)
          return (
            <button
              key={task.id}
              type="button"
              draggable
              className={`task-bar${selectedId === task.id ? ' is-selected' : ''}${isCrit ? ' is-critical' : ''}${rootSelected && !inEpic ? ' is-dim' : ''}${locked ? ' has-lock' : ''}`}
              style={{
                left: box.left,
                width: box.width,
                background: color,
              }}
              onDragStart={(e) => onDragStart(e, task.id)}
              onDragEnd={onDragEnd}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                onSelect(task.id)
              }}
              title={`${task.title} · ${placement.start} → ${placement.end}${locked ? ' · есть внешние блокеры' : ''}`}
            >
              <span className="task-bar-label">{task.title}</span>
              <TfsLink task={task} className="tfs-link tfs-link-inline" />
              {locked && <LockIcon className="task-lock" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DependencyArrows({
  days,
  people,
  tasks,
  placements,
}: {
  days: Date[]
  people: Person[]
  tasks: Task[]
  placements: Record<Id, Placement>
}) {
  const height = people.length * LANE_H
  const width = days.length * DAY_W
  const paths: { key: string; d: string; critical: boolean }[] = []

  for (const task of tasks) {
    const dest = placements[task.id]
    if (!dest) continue
    const destLane = people.findIndex((p) => p.id === dest.assigneeId)
    const destBox = barStyle(days, dest.start, dest.end)
    if (destLane < 0 || !destBox) continue
    for (const depId of task.dependsOn) {
      const src = placements[depId]
      if (!src) continue
      const srcLane = people.findIndex((p) => p.id === src.assigneeId)
      const srcBox = barStyle(days, src.start, src.end)
      if (srcLane < 0 || !srcBox) continue
      const x1 = srcBox.left + srcBox.width
      const y1 = srcLane * LANE_H + LANE_H / 2
      const x2 = destBox.left
      const y2 = destLane * LANE_H + LANE_H / 2
      const mid = Math.max(x1 + 16, (x1 + x2) / 2)
      paths.push({
        key: `${depId}-${task.id}`,
        d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
        critical: false,
      })
    }
  }

  if (paths.length === 0) return null

  return (
    <svg
      className="dep-arrows"
      width={width}
      height={height}
      style={{ left: LABEL_W, width, height }}
    >
      {paths.map((p) => (
        <path key={p.key} d={p.d} />
      ))}
    </svg>
  )
}
