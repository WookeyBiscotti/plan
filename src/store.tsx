import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { createContext, useCallback, useContext } from 'react'
import { buildSchedule, rootIdOf, wouldCycle } from './schedule'
import { createSeed, PEOPLE_COLORS } from './seed'
import type { Id, ProjectState, ScheduleResult, Task } from './types'

const STORAGE_KEY = 'team-plan-v1'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ProjectState
  } catch {
    /* ignore */
  }
  return createSeed()
}

type Action =
  | { type: 'add-backlog'; title: string; estimateDays: number }
  | { type: 'place'; taskId: Id; personId: Id; date: string }
  | { type: 'unplace'; taskId: Id }
  | { type: 'patch'; taskId: Id; patch: Partial<Task> }
  | { type: 'add-subtask'; parentId: Id }
  | { type: 'remove'; taskId: Id }
  | { type: 'toggle-dep'; taskId: Id; depId: Id }
  | { type: 'add-person'; name: string; role: string }
  | { type: 'patch-person'; personId: Id; patch: { name?: string; role?: string } }
  | { type: 'remove-person'; personId: Id }
  | { type: 'import-tasks'; tasks: Task[] }
  | { type: 'reset' }

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'add-backlog': {
      const task: Task = {
        id: uid(),
        title: action.title.trim() || 'Новая задача',
        estimateDays: Math.max(1, action.estimateDays),
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      }
      return { ...state, tasks: [...state.tasks, task] }
    }
    case 'place': {
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.taskId) return task
          const kids = state.tasks.some((t) => t.parentId === task.id)
          if (task.parentId) {
            return { ...task, assigneeId: action.personId, start: action.date }
          }
          return {
            ...task,
            start: action.date,
            assigneeId: kids ? task.assigneeId : action.personId,
          }
        }),
      }
    }
    case 'unplace': {
      const root = rootIdOf(state.tasks, action.taskId)
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id === root) return { ...task, start: null, assigneeId: null }
          if (task.parentId === root) return { ...task, start: null }
          return task
        }),
      }
    }
    case 'patch': {
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId
            ? {
                ...task,
                ...action.patch,
                estimateDays: Math.max(1, action.patch.estimateDays ?? task.estimateDays),
              }
            : task,
        ),
      }
    }
    case 'add-subtask': {
      const parent = state.tasks.find((t) => t.id === action.parentId)
      const existing = state.tasks.filter((t) => t.parentId === action.parentId)
      const child: Task = {
        id: uid(),
        title: existing.length === 0 ? parent?.title ?? 'Подзадача' : `Подзадача ${existing.length + 1}`,
        estimateDays: existing.length === 0 ? parent?.estimateDays ?? 2 : 2,
        parentId: action.parentId,
        assigneeId: parent?.assigneeId ?? state.people[0]?.id ?? null,
        dependsOn: [],
        start: null,
      }
      return { ...state, tasks: [...state.tasks, child] }
    }
    case 'remove': {
      const removing = new Set<Id>([action.taskId])
      for (const task of state.tasks) {
        if (task.parentId === action.taskId) removing.add(task.id)
      }
      return {
        ...state,
        tasks: state.tasks
          .filter((t) => !removing.has(t.id))
          .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((id) => !removing.has(id)) })),
      }
    }
    case 'toggle-dep': {
      const task = state.tasks.find((t) => t.id === action.taskId)
      const already = task?.dependsOn.includes(action.depId)
      if (!already && wouldCycle(state.tasks, action.taskId, action.depId)) return state
      return {
        ...state,
        tasks: state.tasks.map((item) => {
          if (item.id !== action.taskId) return item
          return {
            ...item,
            dependsOn: already
              ? item.dependsOn.filter((id) => id !== action.depId)
              : [...item.dependsOn, action.depId],
          }
        }),
      }
    }
    case 'add-person': {
      return {
        ...state,
        people: [
          ...state.people,
          {
            id: uid(),
            name: action.name.trim() || 'Новый человек',
            role: action.role.trim() || 'Dev',
            color: PEOPLE_COLORS[state.people.length % PEOPLE_COLORS.length],
          },
        ],
      }
    }
    case 'patch-person': {
      return {
        ...state,
        people: state.people.map((person) =>
          person.id === action.personId
            ? {
                ...person,
                name: action.patch.name ?? person.name,
                role: action.patch.role ?? person.role,
              }
            : person,
        ),
      }
    }
    case 'remove-person': {
      return {
        ...state,
        people: state.people.filter((person) => person.id !== action.personId),
        tasks: state.tasks.map((task) => {
          if (task.assigneeId !== action.personId) return task
          const rootLeaf =
            task.parentId === null && !state.tasks.some((child) => child.parentId === task.id)
          return {
            ...task,
            assigneeId: null,
            start: rootLeaf ? null : task.start,
          }
        }),
      }
    }
    case 'import-tasks': {
      const existing = new Set(state.tasks.map((task) => task.id))
      const incoming = action.tasks.filter((task) => !existing.has(task.id))
      if (incoming.length === 0) return state
      const known = new Set([...existing, ...incoming.map((task) => task.id)])
      return {
        ...state,
        tasks: [
          ...state.tasks,
          ...incoming.map((task) => ({
            ...task,
            dependsOn: task.dependsOn.filter((id) => known.has(id)),
          })),
        ],
      }
    }
    case 'reset':
      return createSeed()
  }
}

export type HoverCell = { personId: Id; date: string }

type Store = {
  state: ProjectState
  schedule: ScheduleResult
  selectedId: Id | null
  setSelectedId: (id: Id | null) => void
  draggingId: Id | null
  setDraggingId: (id: Id | null) => void
  hover: HoverCell | null
  setHover: (hover: HoverCell | null) => void
  addBacklog: (title: string, estimateDays: number) => void
  place: (taskId: Id, personId: Id, date: string) => void
  unplace: (taskId: Id) => void
  patch: (taskId: Id, patch: Partial<Task>) => void
  addSubtask: (parentId: Id) => void
  remove: (taskId: Id) => void
  toggleDep: (taskId: Id, depId: Id) => void
  addPerson: (name: string, role: string) => void
  patchPerson: (personId: Id, patch: { name?: string; role?: string }) => void
  removePerson: (personId: Id) => void
  importTasks: (tasks: Task[]) => number
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

export function PlanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const [selectedId, setSelectedId] = useState<Id | null>('pay')
  const [draggingId, setDraggingId] = useState<Id | null>(null)
  const [hover, setHover] = useState<HoverCell | null>(null)

  const schedule = useMemo(() => buildSchedule(state.tasks), [state.tasks])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const addBacklog = useCallback((title: string, estimateDays: number) => {
    dispatch({ type: 'add-backlog', title, estimateDays })
  }, [])

  const place = useCallback((taskId: Id, personId: Id, date: string) => {
    dispatch({ type: 'place', taskId, personId, date })
    setSelectedId(taskId)
    setDraggingId(null)
    setHover(null)
  }, [])

  const unplace = useCallback((taskId: Id) => {
    dispatch({ type: 'unplace', taskId })
    setDraggingId(null)
    setHover(null)
  }, [])

  const patch = useCallback((taskId: Id, patch: Partial<Task>) => {
    dispatch({ type: 'patch', taskId, patch })
  }, [])

  const addSubtask = useCallback((parentId: Id) => {
    dispatch({ type: 'add-subtask', parentId })
  }, [])

  const remove = useCallback((taskId: Id) => {
    dispatch({ type: 'remove', taskId })
    setSelectedId((id) => {
      if (!id || id === taskId) return null
      const selected = state.tasks.find((task) => task.id === id)
      if (!selected || selected.parentId === taskId) return null
      return id
    })
  }, [state.tasks])

  const toggleDep = useCallback((taskId: Id, depId: Id) => {
    dispatch({ type: 'toggle-dep', taskId, depId })
  }, [])

  const addPerson = useCallback((name: string, role: string) => {
    dispatch({ type: 'add-person', name, role })
  }, [])

  const patchPerson = useCallback((personId: Id, patch: { name?: string; role?: string }) => {
    dispatch({ type: 'patch-person', personId, patch })
  }, [])

  const removePerson = useCallback((personId: Id) => {
    dispatch({ type: 'remove-person', personId })
  }, [])

  const importTasks = useCallback((tasks: Task[]) => {
    const existing = new Set(state.tasks.map((task) => task.id))
    const added = tasks.filter((task) => !existing.has(task.id)).length
    if (added > 0) dispatch({ type: 'import-tasks', tasks })
    return added
  }, [state.tasks])

  const reset = useCallback(() => {
    dispatch({ type: 'reset' })
    setSelectedId('pay')
  }, [])

  const store = useMemo<Store>(
    () => ({
      state,
      schedule,
      selectedId,
      setSelectedId,
      draggingId,
      setDraggingId,
      hover,
      setHover,
      addBacklog,
      place,
      unplace,
      patch,
      addSubtask,
      remove,
      toggleDep,
      addPerson,
      patchPerson,
      removePerson,
      importTasks,
      reset,
    }),
    [
      state,
      schedule,
      selectedId,
      draggingId,
      hover,
      addBacklog,
      place,
      unplace,
      patch,
      addSubtask,
      remove,
      toggleDep,
      addPerson,
      patchPerson,
      removePerson,
      importTasks,
      reset,
    ],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function usePlan() {
  const value = useContext(StoreContext)
  if (!value) throw new Error('usePlan outside provider')
  return value
}

export function useRootSelected(): Id | null {
  const { state, selectedId } = usePlan()
  if (!selectedId) return null
  return rootIdOf(state.tasks, selectedId)
}
