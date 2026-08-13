import { useEffect } from 'react'
import { Backlog } from './Backlog'
import { daysLabel, formatDayMonth } from './dates'
import { TaskPanel } from './TaskPanel'
import { TeamEditor } from './TeamEditor'
import { Timeline } from './Timeline'
import { PlanProvider, usePlan } from './store'

function Shell() {
  const { state, schedule, reset, selectedId, setSelectedId } = usePlan()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelectedId])

  const finishes = state.tasks
    .filter((t) => t.parentId === null)
    .map((t) => ({ task: t, stats: schedule.stats[t.id] }))
    .filter((x) => x.stats?.finish)
    .sort((a, b) => a.stats!.finish!.localeCompare(b.stats!.finish!))
  const last = finishes.at(-1)

  return (
    <div className={`app${selectedId ? ' has-panel' : ''}`}>
      <header className="top">
        <div className="brand">
          <p className="eyebrow">Команда разработки</p>
          <h1>План</h1>
        </div>
        <p className="lede">
          Бросьте крупную оценку на дорожку — появится дата. Разложите на людей и связи: эпик
          займёт не сумму дней, а длину критического пути.
        </p>
        <div className="top-meta">
          {last?.stats?.finish && (
            <p>
              Горизонт плана{' '}
              <b>
                {formatDayMonth(last.stats.finish)}
                {last.stats.spanDays ? ` · ${daysLabel(last.stats.spanDays)}` : ''}
              </b>
            </p>
          )}
          <div className="top-actions">
            <TeamEditor />
            <button type="button" onClick={reset}>
              Сбросить демо
            </button>
          </div>
        </div>
      </header>
      <Backlog />
      <Timeline />
      <TaskPanel />
    </div>
  )
}

export default function App() {
  return (
    <PlanProvider>
      <Shell />
    </PlanProvider>
  )
}
