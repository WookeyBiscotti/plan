import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { daysLabel, formatDayMonth, parseISO, workDates, workDaysInclusive } from './dates'
import { wouldCycle } from './schedule'
import { usePlan, useRootSelected } from './store'
import { TfsFieldsModal } from './TfsFieldsModal'
import { ExternalBlockersList } from './ExternalBlockersList'
import { TfsLink } from './TfsLink'
import { hasTfsFields } from './tfsFieldView'
import { isTaskEstimated } from './taskEstimate'
import type { Id, Task } from './types'

function TfsFieldsButton({ task, onShow }: { task: Task; onShow: (task: Task) => void }) {
  if (!hasTfsFields(task)) return null
  return (
    <button type="button" className="tfs-fields-btn" onClick={() => onShow(task)}>
      Поля TFS
    </button>
  )
}

function PanelTitle({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      className="panel-title"
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function endFromStart(start: string, estimateDays: number): string | null {
  if (estimateDays <= 0) return null
  return workDates(parseISO(start), estimateDays).at(-1) ?? null
}

export function TaskPanel({ width, onHide }: { width: number; onHide?: () => void }) {
  const {
    state,
    schedule,
    selectedId,
    setSelectedId,
    patch,
    addSubtask,
    remove,
    toggleDep,
    unplace,
    moveEpicStart,
  } = usePlan()
  const rootId = useRootSelected()
  const [linking, setLinking] = useState(false)
  const [linkFrom, setLinkFrom] = useState<Id | null>(null)
  const [fieldsTask, setFieldsTask] = useState<Task | null>(null)

  if (!rootId) {
    return (
      <aside className="panel panel-empty" style={{ width, flex: 'none' }}>
        <header className="panel-head">
          <h2>Задача</h2>
          {onHide && (
            <button type="button" className="icon-btn" onClick={onHide} aria-label="Скрыть панель">
              ×
            </button>
          )}
        </header>
        <p>
          Выберите карточку слева или полосу на таймлайне. Крупную работу можно разложить на
          подзадачи и указать, что от чего зависит — срок станет короче суммы частей, если куски
          идут параллельно.
        </p>
      </aside>
    )
  }

  const root = state.tasks.find((t) => t.id === rootId)
  if (!root) return null
  const kids = state.tasks.filter((t) => t.parentId === root.id)
  const stats = schedule.stats[root.id]
  const placed = root.start !== null
  const rootEstimated = isTaskEstimated(root)
  const endEditable = kids.length === 0 || !!root.hideSubtasks
  const finishIso =
    stats?.finish ?? (root.start ? endFromStart(root.start, root.estimateDays) : null)

  function onSubtaskClick(taskId: Id) {
    if (!linking) {
      setSelectedId(taskId)
      return
    }
    if (!linkFrom) {
      setLinkFrom(taskId)
      return
    }
    if (linkFrom !== taskId) toggleDep(taskId, linkFrom)
    setLinkFrom(null)
  }

  function onStartChange(event: ChangeEvent<HTMLInputElement>) {
    const date = event.target.value
    if (!date || !root) return
    moveEpicStart(root.id, date)
  }

  function onEndChange(event: ChangeEvent<HTMLInputElement>) {
    const date = event.target.value
    if (!date || !root?.start || !endEditable) return
    const days = workDaysInclusive(parseISO(root.start), parseISO(date))
    patch(root.id, { estimateDays: Math.max(1, days) })
  }

  return (
    <>
      <aside className="panel" style={{ width, flex: 'none' }}>
        <header className="panel-head">
          <div className="panel-head-main">
            <p className="eyebrow">{placed ? 'В плане' : 'В бэклоге'}</p>
            <PanelTitle value={root.title} onChange={(title) => patch(root.id, { title })} />
          </div>
          <div className="panel-head-actions">
            <TfsLink task={root} />
            <TfsFieldsButton task={root} onShow={setFieldsTask} />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSelectedId(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        </header>

      <label className={`field${rootEstimated ? '' : ' is-unestimated'}`}>
        Грубая оценка
        <span className="field-row">
          <input
            type="number"
            min={0}
            max={90}
            value={root.estimateDays}
            onChange={(e) => patch(root.id, { estimateDays: Number(e.target.value) })}
          />
          <em>
            {root.estimateHours != null
              ? `${root.estimateHours} ч → ${root.estimateDays} дн (день ${state.workDayHours} ч · ×${state.velocity})`
              : rootEstimated
                ? 'рабочих дней, пока не разложили'
                : '0 — без оценки, на таймлайн не ставится'}
          </em>
        </span>
      </label>

      {!rootEstimated && !placed && (
        <p className="unestimated-hint">Укажите оценку в днях, чтобы перетащить задачу на таймлайн.</p>
      )}

      <label className="field">
        Исполнитель
        <select
          value={root.assigneeId ?? ''}
          onChange={(e) => patch(root.id, { assigneeId: e.target.value || null })}
        >
          <option value="">— не назначен</option>
          {state.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <em>
          {kids.length > 0 && root.hideSubtasks
            ? 'главная задача на дорожке этого человека'
            : kids.length > 0
              ? 'нужен, если скрыть подзадачи и планировать целиком'
              : 'дорожка на таймлайне'}
        </em>
      </label>

      {kids.length > 0 && (
        <label className="field check-field">
          <span className="field-row">
            <input
              type="checkbox"
              checked={!!root.hideSubtasks}
              onChange={(e) => patch(root.id, { hideSubtasks: e.target.checked })}
            />
            Скрыть подзадачи на таймлайне
          </span>
          <em>
            Планировать главную задачу по её оценке на выбранного исполнителя. Подзадачи остаются в
            панели, но не занимают дорожки.
          </em>
        </label>
      )}

      {root.hideSubtasks && kids.length > 0 && placed && !root.assigneeId && (
        <p className="unestimated-hint">Выберите исполнителя, чтобы главная задача появилась на таймлайне.</p>
      )}

      {placed && root.start && (
        <div className="dates-fields">
          <label className="field">
            Начало
            <input type="date" value={root.start} onChange={onStartChange} />
          </label>
          <label className={`field${endEditable ? '' : ' is-readonly'}`}>
            Конец
            <input
              type="date"
              value={finishIso ?? ''}
              disabled={!endEditable || !finishIso}
              onChange={onEndChange}
            />
            {!endEditable && (
              <em>считается по подзадачам и зависимостям</em>
            )}
          </label>
        </div>
      )}

      {root.externalBlockers && root.externalBlockers.length > 0 && (
        <ExternalBlockersList blockers={root.externalBlockers} />
      )}

      {root.dependsOn.length > 0 && (
        <div className="deps root-deps">
          <span>ждёт</span>
          {root.dependsOn.map((depId) => {
            const dep = state.tasks.find((task) => task.id === depId)
            if (!dep) return null
            return (
              <span key={depId} className="chip-with-link">
                <button
                  type="button"
                  className="chip is-on"
                  onClick={() => setSelectedId(depId)}
                >
                  {dep.title}
                </button>
                <TfsLink task={dep} />
              </span>
            )
          })}
        </div>
      )}

      {stats && placed && (
        <div className={`metrics${stats.savedDays > 0 ? ' has-save' : ''}${stats.cycle ? ' is-bad' : ''}`}>
          {stats.cycle ? (
            <p>В зависимостях цикл — план не считается.</p>
          ) : kids.length > 0 && !root.hideSubtasks ? (
            <>
              <div>
                <b>{daysLabel(stats.spanDays)}</b>
                <span>по плану</span>
              </div>
              <div>
                <b>{daysLabel(stats.sumParts)}</b>
                <span>сумма частей</span>
              </div>
              <div>
                <b>{stats.savedDays > 0 ? `−${daysLabel(stats.savedDays)}` : '0 дней'}</b>
                <span>за счёт параллельности</span>
              </div>
              {stats.finish && (
                <p className="metrics-finish">
                  Готово {formatDayMonth(stats.finish)}
                  {stats.start ? ` · старт ${formatDayMonth(stats.start)}` : ''}
                </p>
              )}
            </>
          ) : (
            <p>
              На одном исполнителе это {daysLabel(root.estimateDays)}
              {stats.finish ? `, до ${formatDayMonth(stats.finish)}` : ''}. Разбейте на подзадачи,
              чтобы отдать куски разным людям.
            </p>
          )}
        </div>
      )}

      <div className={`panel-section${root.hideSubtasks ? ' is-collapsed' : ''}`}>
        <div className="section-head">
          <h3>Подзадачи{root.hideSubtasks ? ' · скрыты' : ''}</h3>
          <button type="button" onClick={() => addSubtask(root.id)}>
            Добавить
          </button>
        </div>
        <p className="hint">
          {root.hideSubtasks
            ? 'Подзадачи скрыты с таймлайна — на дорожке лежит главная задача. Снимите галочку, чтобы снова планировать по частям.'
            : 'Независимые куски на разных людях идут одновременно. Связь: включите режим, затем кликните работу-предшественник и ту, что должна ждать.'}
        </p>
        {kids.length > 1 && (
          <button
            type="button"
            className={`link-mode${linking ? ' is-on' : ''}`}
            onClick={() => {
              setLinking((v) => !v)
              setLinkFrom(null)
            }}
          >
            {linkFrom
              ? 'Теперь кликните зависимую · отмена'
              : linking
                ? 'Режим связей включён · готово'
                : 'Связать зависимости'}
          </button>
        )}
        {kids.length === 0 && <p className="muted">Пока одна цельная оценка.</p>}
        <ul className="subtasks">
          {kids.map((kid) => (
            <SubtaskRow
              key={kid.id}
              task={kid}
              siblings={kids}
              allTasks={state.tasks}
              people={state.people}
              selected={selectedId === kid.id}
              linking={linkFrom === kid.id}
              waitLink={linking}
              critical={stats?.critical.includes(kid.id) ?? false}
              placement={schedule.placements[kid.id]}
              onPatch={patch}
              onRemove={remove}
              onToggleDep={toggleDep}
              onClick={() => onSubtaskClick(kid.id)}
              onShowFields={setFieldsTask}
            />
          ))}
        </ul>
      </div>

      <div className="panel-actions">
        {placed && (
          <button type="button" onClick={() => unplace(root.id)}>
            Вернуть в бэклог
          </button>
        )}
        <button type="button" className="danger" onClick={() => remove(root.id)}>
          Удалить
        </button>
      </div>
      </aside>
      <TfsFieldsModal task={fieldsTask} onClose={() => setFieldsTask(null)} />
    </>
  )
}

function SubtaskRow({
  task,
  siblings,
  allTasks,
  people,
  selected,
  linking,
  waitLink,
  critical,
  placement,
  onPatch,
  onRemove,
  onToggleDep,
  onClick,
  onShowFields,
}: {
  task: Task
  siblings: Task[]
  allTasks: Task[]
  people: { id: Id; name: string }[]
  selected: boolean
  linking: boolean
  waitLink: boolean
  critical: boolean
  placement?: { start: string; end: string }
  onPatch: (id: Id, patch: Partial<Task>) => void
  onRemove: (id: Id) => void
  onToggleDep: (taskId: Id, depId: Id) => void
  onClick: () => void
  onShowFields: (task: Task) => void
}) {
  const others = siblings.filter((s) => s.id !== task.id)
  const estimated = isTaskEstimated(task)

  function onStartChange(event: ChangeEvent<HTMLInputElement>) {
    const date = event.target.value
    if (!date) return
    onPatch(task.id, { start: date })
  }

  function onEndChange(event: ChangeEvent<HTMLInputElement>) {
    const date = event.target.value
    const start = placement?.start ?? task.start
    if (!date || !start) return
    const days = workDaysInclusive(parseISO(start), parseISO(date))
    onPatch(task.id, { estimateDays: Math.max(1, days) })
  }

  return (
    <li
      className={`subtask${selected ? ' is-selected' : ''}${linking ? ' is-linking' : ''}${waitLink ? ' wait-link' : ''}${estimated ? '' : ' is-unestimated'}`}
    >
      <div className="subtask-hit">
        <button type="button" className="subtask-select" onClick={onClick}>
          {waitLink ? '●' : '○'}
        </button>
        <input
          value={task.title}
          onChange={(e) => onPatch(task.id, { title: e.target.value })}
        />
        {critical && <span className="crit">крит.</span>}
        {!estimated && <span className="unestimated-badge">Без оценки</span>}
        <TfsLink task={task} />
        <TfsFieldsButton task={task} onShow={onShowFields} />
      </div>
      <div className="subtask-row">
        <label>
          дн
          <input
            type="number"
            min={0}
            max={40}
            value={task.estimateDays}
            onChange={(e) => onPatch(task.id, { estimateDays: Number(e.target.value) })}
          />
        </label>
        <label>
          кто
          <select
            value={task.assigneeId ?? ''}
            onChange={(e) => onPatch(task.id, { assigneeId: e.target.value || null })}
          >
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.split(' ')[0]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="tiny danger" onClick={() => onRemove(task.id)}>
          ×
        </button>
      </div>
      {placement && (
        <div className="sub-dates-fields">
          <label>
            с
            <input type="date" value={placement.start} onChange={onStartChange} />
          </label>
          <label>
            по
            <input type="date" value={placement.end} onChange={onEndChange} />
          </label>
        </div>
      )}
      {task.externalBlockers && task.externalBlockers.length > 0 && (
        <ExternalBlockersList blockers={task.externalBlockers} />
      )}
      <div className="deps">
        <span>ждёт</span>
        {others.map((other) => {
          const on = task.dependsOn.includes(other.id)
          const blocked = !on && wouldCycle(allTasks, task.id, other.id)
          return (
            <span key={other.id} className="chip-with-link">
              <button
                type="button"
                className={`chip${on ? ' is-on' : ''}`}
                disabled={blocked}
                onClick={() => onToggleDep(task.id, other.id)}
              >
                {other.title}
              </button>
              <TfsLink task={other} />
            </span>
          )
        })}
        {others.length === 0 && <em>нет других</em>}
      </div>
    </li>
  )
}
