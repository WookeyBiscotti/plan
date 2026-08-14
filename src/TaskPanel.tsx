import { useState } from 'react'
import { daysLabel, formatDayMonth } from './dates'
import { wouldCycle } from './schedule'
import { usePlan, useRootSelected } from './store'
import { TfsFieldsModal } from './TfsFieldsModal'
import { hasTfsFields } from './tfsFieldView'
import type { Id, Task } from './types'

function TfsFieldsButton({ task, onShow }: { task: Task; onShow: (task: Task) => void }) {
  if (!hasTfsFields(task)) return null
  return (
    <button type="button" className="tfs-fields-btn" onClick={() => onShow(task)}>
      Поля TFS
    </button>
  )
}

export function TaskPanel() {
  const { state, schedule, selectedId, setSelectedId, patch, addSubtask, remove, toggleDep, unplace } =
    usePlan()
  const rootId = useRootSelected()
  const [linking, setLinking] = useState(false)
  const [linkFrom, setLinkFrom] = useState<Id | null>(null)
  const [fieldsTask, setFieldsTask] = useState<Task | null>(null)

  if (!rootId) {
    return (
      <aside className="panel panel-empty">
        <h2>Задача</h2>
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

  return (
    <>
      <aside className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">{placed ? 'В плане' : 'В бэклоге'}</p>
            <input
              className="panel-title"
              value={root.title}
              onChange={(e) => patch(root.id, { title: e.target.value })}
            />
          </div>
          <div className="panel-head-actions">
            <TfsFieldsButton task={root} onShow={setFieldsTask} />
            <button type="button" className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Закрыть">
              ×
            </button>
          </div>
        </header>

      <label className="field">
        Грубая оценка
        <span className="field-row">
          <input
            type="number"
            min={1}
            max={90}
            value={root.estimateDays}
            onChange={(e) => patch(root.id, { estimateDays: Number(e.target.value) })}
          />
          <em>рабочих дней, пока не разложили</em>
        </span>
      </label>

      {stats && placed && (
        <div className={`metrics${stats.savedDays > 0 ? ' has-save' : ''}${stats.cycle ? ' is-bad' : ''}`}>
          {stats.cycle ? (
            <p>В зависимостях цикл — план не считается.</p>
          ) : kids.length > 0 ? (
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

      <div className="panel-section">
        <div className="section-head">
          <h3>Подзадачи</h3>
          <button type="button" onClick={() => addSubtask(root.id)}>
            Добавить
          </button>
        </div>
        <p className="hint">
          Независимые куски на разных людях идут одновременно. Связь: включите режим, затем
          кликните работу-предшественник и ту, что должна ждать.
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

  return (
    <li
      className={`subtask${selected ? ' is-selected' : ''}${linking ? ' is-linking' : ''}${waitLink ? ' wait-link' : ''}`}
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
        <TfsFieldsButton task={task} onShow={onShowFields} />
      </div>
      <div className="subtask-row">
        <label>
          дн
          <input
            type="number"
            min={1}
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
        <p className="sub-dates">
          {formatDayMonth(placement.start)} → {formatDayMonth(placement.end)}
        </p>
      )}
      <div className="deps">
        <span>ждёт</span>
        {others.map((other) => {
          const on = task.dependsOn.includes(other.id)
          const blocked = !on && wouldCycle(allTasks, task.id, other.id)
          return (
            <button
              key={other.id}
              type="button"
              className={`chip${on ? ' is-on' : ''}`}
              disabled={blocked}
              onClick={() => onToggleDep(task.id, other.id)}
            >
              {other.title}
            </button>
          )
        })}
        {others.length === 0 && <em>нет других</em>}
      </div>
    </li>
  )
}
