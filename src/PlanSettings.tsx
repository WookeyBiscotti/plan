import { useEffect, useRef, useState } from 'react'
import { effectiveDayHours } from './taskEstimate'
import { usePlan } from './store'

export function PlanSettings() {
  const { state, patchPlanSettings } = usePlan()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const effective = effectiveDayHours(state.workDayHours, state.velocity)

  return (
    <div className="team-wrap" ref={root}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        День · {state.workDayHours}ч · ×{state.velocity}
      </button>
      {open && (
        <form
          className="team-pop plan-settings-pop"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
          }}
        >
          <p className="team-pop-lead">
            Длина дня и коэффициент выполнения пересчитывают дни у задач с оценкой в часах
            (из TFS). Пример: 8 ч при дне 8 ч и коэффициенте 0.5 → 2 дня.
          </p>
          <label>
            Рабочий день, ч
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={state.workDayHours}
              onChange={(e) => patchPlanSettings({ workDayHours: Number(e.target.value) })}
            />
          </label>
          <label>
            Коэффициент выполнения
            <input
              type="number"
              min={0.05}
              max={5}
              step={0.05}
              value={state.velocity}
              onChange={(e) => patchPlanSettings({ velocity: Number(e.target.value) })}
            />
          </label>
          <p className="plan-settings-note">
            Эффективно в день: <b>{effective.toFixed(2)} ч</b>
            {state.velocity < 1
              ? ` · задачи растягиваются в ${(1 / state.velocity).toFixed(1)}×`
              : state.velocity > 1
                ? ` · задачи сжимаются в ${state.velocity.toFixed(1)}×`
                : ''}
          </p>
          <button type="submit">Готово</button>
        </form>
      )}
    </div>
  )
}
