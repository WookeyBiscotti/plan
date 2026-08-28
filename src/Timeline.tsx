import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import {
  daysLabel,
  formatDay,
  formatDayMonth,
  isWeekend,
  mondayOnOrBefore,
  monthLabel,
  parseISO,
  rangeDays,
  todayISO,
  toISO,
  weekdayLetter,
  workDates,
} from './dates'
import { usePlan, useRootSelected } from './store'
import { TrashIcon, LockIcon, EyeOffIcon } from './icons'
import { TfsLink } from './TfsLink'
import type { EpicStats, Id, Person, Placement, Task } from './types'
import { hasExternalBlockers } from './tfsImport'
import { canPlaceOnTimeline, isTaskEstimated } from './taskEstimate'
import { taskTimelineDateMarks, type TimelineDateMark } from './tfsFieldView'
import {
  barStyle,
  dateFromPoint,
  DAY_WIDTH_PRESETS,
  epicColor,
  readDayWidth,
  timelineDayCount,
  writeDayWidth,
} from './timelineView'

export const LABEL_W = 176
export const LANE_H = 56
export const EPIC_ROW_H = 44

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

function epicSpan(task: Task): { start: string; end: string } | null {
  if (!task.start || !isTaskEstimated(task)) return null
  const end = workDates(parseISO(task.start), task.estimateDays).at(-1)
  if (!end) return null
  return { start: task.start, end }
}

function readyDateMarkLeft(days: Date[], iso: string, dayW: number): number | null {
  const index = days.findIndex((d) => toISO(d) === iso)
  if (index < 0) return null
  return index * dayW + dayW / 2
}

function ReadyDateMark({
  days,
  mark,
  dayW,
  taskTitle,
}: {
  days: Date[]
  mark: TimelineDateMark
  dayW: number
  taskTitle: string
}) {
  const left = readyDateMarkLeft(days, mark.date, dayW)
  if (left == null) return null
  return (
    <div
      className={`ready-date-mark is-${mark.kind}`}
      style={{ left }}
      title={`${taskTitle} · ${mark.label} ${formatDayMonth(mark.date)}`}
    />
  )
}

function TaskDateMarks({
  days,
  dayW,
  task,
}: {
  days: Date[]
  dayW: number
  task: Task
}) {
  const marks = taskTimelineDateMarks(task)
  if (marks.length === 0) return null
  return (
    <>
      {marks.map((mark) => (
        <ReadyDateMark
          key={`${task.id}-${mark.kind}-${mark.date}`}
          days={days}
          mark={mark}
          dayW={dayW}
          taskTitle={task.title}
        />
      ))}
    </>
  )
}

function dateMarksTitle(task: Task): string {
  return taskTimelineDateMarks(task)
    .map((mark) => ` · ${mark.label} ${formatDayMonth(mark.date)}`)
    .join('')
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
    shiftPlanStart,
    setPlanStart,
    setSelectedId,
    selectedId,
  } = usePlan()
  const rootSelected = useRootSelected()
  const scroller = useRef<HTMLDivElement>(null)
  const didScrollToToday = useRef(false)
  const prevPlanStart = useRef(state.planStart)
  const epicBodies = useRef<Map<number, HTMLElement>>(new Map())
  const [epicHoverDate, setEpicHoverDate] = useState<string | null>(null)
  const [epicMove, setEpicMove] = useState<{ taskId: Id; date: string } | null>(null)
  const [dayW, setDayW] = useState(readDayWidth)
  const dayCount = useMemo(
    () => timelineDayCount(state.planStart, state.tasks, schedule.placements),
    [state.planStart, state.tasks, schedule.placements],
  )
  const days = useMemo(() => rangeDays(state.planStart, dayCount), [state.planStart, dayCount])
  const today = todayISO()
  const todayIndex = days.findIndex((d) => toISO(d) === today)
  const width = days.length * dayW
  const visiblePeople = useMemo(
    () => state.people.filter((person) => !person.timelineHidden),
    [state.people],
  )
  const rangeEnd = days.length > 0 ? toISO(days[days.length - 1]) : state.planStart

  useEffect(() => {
    const prev = prevPlanStart.current
    if (prev !== state.planStart) {
      const deltaDays = Math.round(
        (parseISO(state.planStart).getTime() - parseISO(prev).getTime()) / 86_400_000,
      )
      if (scroller.current && deltaDays !== 0) {
        scroller.current.scrollLeft = Math.max(0, scroller.current.scrollLeft + deltaDays * dayW)
      }
      prevPlanStart.current = state.planStart
    }
  }, [state.planStart, dayW])

  useEffect(() => {
    if (didScrollToToday.current) return
    const el = scroller.current
    if (!el || todayIndex < 0) return
    el.scrollLeft = Math.max(0, todayIndex * dayW - 120)
    didScrollToToday.current = true
  }, [todayIndex, dayW])

function scrollToToday() {
    const monday = mondayOnOrBefore(today)
    setPlanStart(monday)
    didScrollToToday.current = true
    requestAnimationFrame(() => {
      const el = scroller.current
      if (!el) return
      const viewDays = rangeDays(monday, dayCount)
      const idx = viewDays.findIndex((d) => toISO(d) === today)
      if (idx >= 0) el.scrollLeft = Math.max(0, idx * dayW - 120)
    })
  }

  function onZoomChange(width: number) {
    setDayW(width)
    writeDayWidth(width)
  }

  const dragging = state.tasks.find((t) => t.id === draggingId) ?? null
  const draggingRoot =
    dragging && dragging.parentId === null && canPlaceOnTimeline(dragging) ? dragging : null
  const ghost =
    hover && dragging && canPlaceOnTimeline(dragging)
      ? workDates(parseISO(hover.date), dragging.estimateDays)
      : null
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

  const leafPlacements = Object.values(schedule.placements).filter((placement) => {
    const task = state.tasks.find((t) => t.id === placement.taskId)
    if (!task) return false
    if (task.parentId) {
      const parent = state.tasks.find((t) => t.id === task.parentId)
      return !parent?.hideSubtasks
    }
    return true
  })

  const epicRows = useMemo(() => {
    const epicTasks = state.tasks.filter(
      (t) =>
        t.parentId === null &&
        t.start &&
        !t.hideSubtasks &&
        state.tasks.some((c) => c.parentId === t.id),
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
      const body =
        bodies.find((node) => {
          const rect = node.getBoundingClientRect()
          return event.clientX >= rect.left && event.clientX <= rect.right
        }) ?? bodies[0]
      if (!body) return
      setEpicMove((prev) =>
        prev ? { ...prev, date: dateFromPoint(body, event.clientX, days, dayW) } : null,
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
  }, [epicMove, days, dayW, moveEpicStart])

  function epicDateFromEvent(event: DragEvent<HTMLElement> | React.DragEvent<HTMLElement>) {
    const body = event.currentTarget
    return dateFromPoint(body, event.clientX, days, dayW)
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
    if (!task || task.parentId || !canPlaceOnTimeline(task)) return
    const date = epicDateFromEvent(event)
    const personId = task.assigneeId ?? state.people[0]?.id
    if (!personId) return
    place(id, personId, date)
    setEpicHoverDate(null)
  }

  function beginEpicMove(event: PointerEvent<HTMLButtonElement>, taskId: Id, start: string) {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task || !canPlaceOnTimeline(task)) return
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
    setHover({ personId, date: dateFromPoint(body, event.clientX, days, dayW) })
  }

  function onLaneDrop(event: DragEvent<HTMLElement>, personId: Id) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    const body = event.currentTarget.querySelector('.lane-body')
    if (!id || !(body instanceof HTMLElement)) return
    const task = state.tasks.find((t) => t.id === id)
    if (!task || !canPlaceOnTimeline(task)) return
    place(id, personId, dateFromPoint(body, event.clientX, days, dayW))
  }

  function startDrag(event: DragEvent, taskId: Id) {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task || !canPlaceOnTimeline(task)) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData('text/plain', taskId)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingId(taskId)
    setSelectedId(taskId)
  }

  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <div className="timeline-nav">
          <button type="button" onClick={() => shiftPlanStart(-14)} title="На 2 недели назад">
            ← 2 нед
          </button>
          <button type="button" onClick={() => shiftPlanStart(-7)} title="На неделю назад">
            ← Нед
          </button>
          <button type="button" onClick={scrollToToday} title="К текущей неделе">
            Сегодня
          </button>
          <button type="button" onClick={() => shiftPlanStart(7)} title="На неделю вперёд">
            Нед →
          </button>
          <button type="button" onClick={() => shiftPlanStart(14)} title="На 2 недели вперёд">
            2 нед →
          </button>
        </div>
        <p className="timeline-range">
          {formatDayMonth(state.planStart)} — {formatDayMonth(rangeEnd)}
        </p>
        <label className="timeline-zoom">
          Масштаб
          <select
            value={dayW}
            onChange={(e) => onZoomChange(Number.parseInt(e.target.value, 10))}
          >
            {DAY_WIDTH_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.width}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={`timeline-scroll${dayW <= 14 ? ' is-compact' : ''}`} ref={scroller}>
      <div className="timeline-inner" style={{ minWidth: LABEL_W + width }}>
        <div className="axis">
          <div className="lane-label axis-corner">Исполнитель</div>
          <div className="axis-body" style={{ width }}>
            <div className="axis-months">
              {monthGroups.map((g) => (
                <div key={g.label} className="axis-month" style={{ width: g.count * dayW }}>
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
                    style={{ width: dayW }}
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
                  style={{ width: dayW }}
                />
              ))}
              {epicGhostDates && (
                <div
                  className="ghost-bar epic-ghost"
                  style={
                    barStyle(days, epicGhostDates[0], epicGhostDates[epicGhostDates.length - 1], dayW) ??
                    undefined
                  }
                />
              )}
              {epicMoveDates && row.some(({ task }) => task.id === epicMove?.taskId) && (
                <div
                  className="ghost-bar epic-ghost is-moving"
                  style={
                    barStyle(days, epicMoveDates[0], epicMoveDates[epicMoveDates.length - 1], dayW) ??
                    undefined
                  }
                />
              )}
              {row.map(({ task, span, stats }) => {
                const box = barStyle(days, span.start, span.end, dayW)
                if (!box) return null
                const kids = state.tasks.filter((t) => t.parentId === task.id)
                const color = epicColor(task.id)
                return (
                  <Fragment key={task.id}>
                  <button
                    type="button"
                    className={`epic-bar${rootSelected === task.id ? ' is-selected' : ''}${epicMove?.taskId === task.id ? ' is-moving' : ''}`}
                    style={{
                      left: box.left,
                      width: box.width,
                      opacity: epicMove?.taskId === task.id ? 0.35 : 1,
                      background: `color-mix(in srgb, ${color} 28%, transparent)`,
                      borderColor: color,
                      boxShadow: `inset 3px 0 0 ${color}`,
                    }}
                    onPointerDown={(e) => beginEpicMove(e, task.id, span.start)}
                    onClick={() => setSelectedId(task.id)}
                  >
                    <span className="epic-bar-title">{task.title}</span>
                    <TfsLink task={task} className="tfs-link tfs-link-inline" />
                    <em>
                      {kids.length > 0 && stats
                        ? `${stats.spanDays}д / ${stats.sumParts}д`
                        : daysLabel(task.estimateDays)}
                    </em>
                  </button>
                  <TaskDateMarks days={days} dayW={dayW} task={task} />
                  </Fragment>
                )
              })}
            </div>
          </div>
        ))}

        <div className="lanes">
          {todayIndex >= 0 && (
            <div
              className="today-line"
              style={{ left: LABEL_W + todayIndex * dayW }}
            />
          )}
          {visiblePeople.length === 0 && (
            <p className="lanes-empty">Все дорожки скрыты — включите людей в панели «Команда».</p>
          )}
          {visiblePeople.map((person) => (
            <Lane
              key={person.id}
              person={person}
              dayW={dayW}
              days={days}
              today={today}
              width={width}
              placements={leafPlacements.filter((p) => p.assigneeId === person.id)}
              tasks={state.tasks}
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
          {rootSelected &&
            visiblePeople.length > 0 &&
            !state.tasks.find((t) => t.id === rootSelected)?.hideSubtasks && (
            <DependencyArrows
              dayW={dayW}
              days={days}
              people={visiblePeople}
              tasks={state.tasks.filter((t) => t.parentId === rootSelected)}
              placements={schedule.placements}
            />
          )}
        </div>
      </div>
      </div>
    </section>
  )
}

function Lane({
  person,
  dayW,
  days,
  today,
  width,
  placements,
  tasks,
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
  dayW: number
  days: Date[]
  today: string
  width: number
  placements: Placement[]
  tasks: Task[]
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
  const { patchPerson, removePerson, togglePersonTimeline } = usePlan()
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const ghostBox =
    ghost && ghost.length > 0 ? barStyle(days, ghost[0], ghost[ghost.length - 1], dayW) : null

  return (
    <div
      className="lane"
      style={{ '--lane-color': person.color } as CSSProperties}
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
          className="lane-hide"
          aria-label={`Скрыть ${person.name} на таймлайне`}
          title="Скрыть с таймлайна"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            togglePersonTimeline(person.id)
          }}
        >
          <EyeOffIcon />
        </button>
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
            style={{ width: dayW }}
          />
        ))}
        {ghostBox && (
          <div className="ghost-bar" style={{ left: ghostBox.left, width: ghostBox.width }} />
        )}
        {placements.map((placement) => {
          const task = byId.get(placement.taskId)
          if (!task) return null
          const box = barStyle(days, placement.start, placement.end, dayW)
          if (!box) return null
          const color = person.color
          const isCrit = critical.includes(task.id)
          const inEpic = rootSelected && (task.id === rootSelected || task.parentId === rootSelected)
          const locked = hasExternalBlockers(task)
          const marksTitle = dateMarksTitle(task)
          return (
            <Fragment key={task.id}>
            <button
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
              title={`${task.title} · ${placement.start} → ${placement.end}${locked ? ' · есть внешние блокеры' : ''}${marksTitle}`}
            >
              <span className="task-bar-label">{task.title}</span>
              <TfsLink task={task} className="tfs-link tfs-link-inline" />
              {locked && <LockIcon className="task-lock" />}
            </button>
            <TaskDateMarks days={days} dayW={dayW} task={task} />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function DependencyArrows({
  dayW,
  days,
  people,
  tasks,
  placements,
}: {
  dayW: number
  days: Date[]
  people: Person[]
  tasks: Task[]
  placements: Record<Id, Placement>
}) {
  const height = people.length * LANE_H
  const width = days.length * dayW
  const paths: { key: string; d: string; critical: boolean }[] = []

  for (const task of tasks) {
    const dest = placements[task.id]
    if (!dest) continue
    const destLane = people.findIndex((p) => p.id === dest.assigneeId)
    const destBox = barStyle(days, dest.start, dest.end, dayW)
    if (destLane < 0 || !destBox) continue
    for (const depId of task.dependsOn) {
      const src = placements[depId]
      if (!src) continue
      const srcLane = people.findIndex((p) => p.id === src.assigneeId)
      const srcBox = barStyle(days, src.start, src.end, dayW)
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
