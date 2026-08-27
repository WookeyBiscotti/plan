import { useEffect } from 'react'
import { Backlog } from './Backlog'
import { daysLabel, formatDayMonth } from './dates'
import { TaskPanel } from './TaskPanel'
import { TeamEditor } from './TeamEditor'
import { Timeline } from './Timeline'
import { PlanSettings } from './PlanSettings'
import { ProjectIO } from './ProjectIO'
import { TfsImportDialog } from './TfsImportDialog'
import { ResizeHandle, useLayoutPrefs } from './layoutPrefs'
import { PlanProvider, usePlan } from './store'

function Shell() {
  const { state, schedule, selectedId, setSelectedId } = usePlan()
  const {
    bodyRef,
    backlogW,
    panelW,
    showBacklog,
    showPanel,
    setShowPanel,
    toggleBacklog,
    togglePanel,
    resizeBacklog,
    resizePanel,
  } = useLayoutPrefs()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelectedId])

  useEffect(() => {
    if (selectedId) setShowPanel(true)
  }, [selectedId, setShowPanel])

  const finishes = state.tasks
    .filter((t) => t.parentId === null)
    .map((t) => ({ task: t, stats: schedule.stats[t.id] }))
    .filter((x) => x.stats?.finish)
    .sort((a, b) => a.stats!.finish!.localeCompare(b.stats!.finish!))
  const last = finishes.at(-1)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <p className="eyebrow">Команда разработки</p>
          <h1>План</h1>
        </div>
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
            <div className="panel-toggles" role="group" aria-label="Панели">
              <button
                type="button"
                className={showBacklog ? 'is-on' : undefined}
                aria-pressed={showBacklog}
                onClick={toggleBacklog}
              >
                Входящие
              </button>
              <button
                type="button"
                className={showPanel ? 'is-on' : undefined}
                aria-pressed={showPanel}
                onClick={togglePanel}
              >
                Задача
              </button>
            </div>
            <PlanSettings />
            <TfsImportDialog />
            <TeamEditor />
            <ProjectIO />
          </div>
        </div>
      </header>
      <div className="app-body" ref={bodyRef}>
        {showBacklog && (
          <>
            <Backlog width={backlogW} />
            <ResizeHandle label="Ширина бэклога" onDrag={resizeBacklog} />
          </>
        )}
        <div className="timeline-area">
          <Timeline />
        </div>
        {showPanel && (
          <>
            <ResizeHandle label="Ширина панели задачи" onDrag={resizePanel} />
            <TaskPanel width={panelW} onHide={() => setShowPanel(false)} />
          </>
        )}
      </div>
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
