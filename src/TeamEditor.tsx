import { useEffect, useRef, useState, type FormEvent } from 'react'
import { TrashIcon } from './icons'
import { usePlan } from './store'

export function TeamEditor() {
  const { state, addPerson, patchPerson, removePerson, togglePersonTimeline } = usePlan()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Dev')
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

  function onAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    addPerson(name, role)
    setName('')
    setRole('Dev')
  }

  return (
    <div className="team-wrap" ref={root}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Команда · {state.people.length}
      </button>
      {open && (
        <div className="team-pop">
          <p className="team-pop-lead">Имя и роль можно править прямо в списке. Удаление снимет задачи с дорожки.</p>
          <ul className="team-list">
            {state.people.map((person) => (
              <li key={person.id} className="team-row">
                <span className="swatch" style={{ background: person.color }} />
                <input
                  aria-label="Имя"
                  value={person.name}
                  onChange={(e) => patchPerson(person.id, { name: e.target.value })}
                  onBlur={() => {
                    if (!person.name.trim()) patchPerson(person.id, { name: 'Исполнитель' })
                  }}
                />
                <input
                  aria-label="Роль"
                  value={person.role}
                  onChange={(e) => patchPerson(person.id, { role: e.target.value })}
                  onBlur={() => {
                    if (!person.role.trim()) patchPerson(person.id, { role: 'Dev' })
                  }}
                />
                <button
                  type="button"
                  className={`team-toggle${person.timelineHidden ? ' is-off' : ''}`}
                  aria-label={person.timelineHidden ? `Показать ${person.name} на таймлайне` : `Скрыть ${person.name} на таймлайне`}
                  title={person.timelineHidden ? 'Показать на таймлайне' : 'Скрыть с таймлайна'}
                  onClick={() => togglePersonTimeline(person.id)}
                >
                  {person.timelineHidden ? 'Скрыт' : 'Виден'}
                </button>
                <button
                  type="button"
                  className="backlog-trash"
                  aria-label={`Удалить ${person.name}`}
                  title="Удалить из команды"
                  onClick={() => removePerson(person.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
          {state.people.length === 0 && <p className="muted">В команде никого нет.</p>}
          <form className="team-add" onSubmit={onAdd}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя"
              aria-label="Новый человек"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Роль"
              aria-label="Роль"
            />
            <button type="submit">Добавить</button>
          </form>
        </div>
      )}
    </div>
  )
}
