import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { createContext, useCallback, useContext } from 'react'
import { buildSchedule, rootIdOf, wouldCycle } from './schedule'
import { addDays, mondayOnOrBefore, parseISO, shiftWorkDays, toISO, workDayOffset } from './dates'
import { createEmptyProject, createSeed, PEOPLE_COLORS } from './seed'
import { mergeImportedTasks } from './tfsImport'
import {
  applyEstimateSettings,
  canPlaceOnTimeline,
  DEFAULT_VELOCITY,
  DEFAULT_WORK_DAY_HOURS,
} from './taskEstimate'
import type { Id, ProjectState, ScheduleResult, Task } from './types'

const STORAGE_KEY = 'team-plan-v1'

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function normalizeLoadedState(raw: ProjectState): ProjectState {
  return {
    ...raw,
    workDayHours:
      typeof raw.workDayHours === 'number' && raw.workDayHours > 0
        ? raw.workDayHours
        : DEFAULT_WORK_DAY_HOURS,
    velocity:
      typeof raw.velocity === 'number' && raw.velocity > 0 ? raw.velocity : DEFAULT_VELOCITY,
  }
}

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeLoadedState(JSON.parse(raw) as ProjectState)
  } catch {
    /* ignore */
  }
  return createSeed()
}

function planStartCovering(planStart: string, date: string): string {
  return date < planStart ? mondayOnOrBefore(date) : planStart
}

type Action =
  | { type: 'add-backlog'; title: string; estimateDays: number }
  | { type: 'place'; taskId: Id; personId: Id; date: string }
  | { type: 'move-epic'; taskId: Id; date: string }
  | { type: 'shift-plan-start'; days: number }
  | { type: 'set-plan-start'; date: string }
  | { type: 'unplace'; taskId: Id }
  | { type: 'patch'; taskId: Id; patch: Partial<Task> }
  | { type: 'add-subtask'; parentId: Id }
  | { type: 'remove'; taskId: Id }
  | { type: 'toggle-dep'; taskId: Id; depId: Id }
  | { type: 'add-person'; name: string; role: string }
  | { type: 'patch-person'; personId: Id; patch: { name?: string; role?: string } }
  | { type: 'toggle-person-timeline'; personId: Id }
  | { type: 'remove-person'; personId: Id }
  | { type: 'patch-plan-settings'; patch: { workDayHours?: number; velocity?: number } }
  | { type: 'import-tasks'; tasks: Task[] }
  | { type: 'load-project'; project: ProjectState }
  | { type: 'clear-project' }
  | { type: 'reset' }

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case 'add-backlog': {
      const task: Task = {
        id: uid(),
        title: action.title.trim() || 'Новая задача',
        estimateDays: Math.max(0, action.estimateDays),
        parentId: null,
        assigneeId: null,
        dependsOn: [],
        start: null,
      }
      return { ...state, tasks: [...state.tasks, task] }
    }
    case 'place': {
      const task = state.tasks.find((t) => t.id === action.taskId)
      if (!task || !canPlaceOnTimeline(task)) return state
      const hasKids = state.tasks.some((t) => t.parentId === action.taskId)
      const planStart = planStartCovering(state.planStart, action.date)
      return {
        ...state,
        planStart,
        tasks: state.tasks.map((task) => {
          if (task.id === action.taskId) {
            if (task.parentId) {
              return { ...task, assigneeId: action.personId, start: action.date }
            }
            return {
              ...task,
              start: action.date,
              assigneeId: hasKids ? task.assigneeId : action.personId,
            }
          }
          if (hasKids && task.parentId === action.taskId && !task.assigneeId) {
            return { ...task, assigneeId: action.personId }
          }
          return task
        }),
      }
    }
    case 'move-epic': {
      const root = state.tasks.find((t) => t.id === action.taskId)
      if (!root?.start || !canPlaceOnTimeline(root)) return state
      const delta = workDayOffset(root.start, action.date)
      if (delta === 0) return state
      const planStart = planStartCovering(state.planStart, action.date)
      return {
        ...state,
        planStart,
        tasks: state.tasks.map((task) => {
          if (task.id === action.taskId) return { ...task, start: action.date }
          if (task.parentId === action.taskId && task.start) {
            return { ...task, start: shiftWorkDays(task.start, delta) }
          }
          return task
        }),
      }
    }
    case 'shift-plan-start': {
      return {
        ...state,
        planStart: toISO(addDays(parseISO(state.planStart), action.days)),
      }
    }
    case 'set-plan-start': {
      return { ...state, planStart: action.date }
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
      const current = state.tasks.find((t) => t.id === action.taskId)
      if (!current) return state
      const nextEstimate =
        action.patch.estimateDays !== undefined
          ? Math.max(0, action.patch.estimateDays)
          : current.estimateDays
      let tasks = state.tasks.map((task) => {
        if (task.id !== action.taskId) return task
        const next: Task = { ...task, ...action.patch, estimateDays: nextEstimate }
        if (action.patch.estimateDays !== undefined && action.patch.estimateHours === undefined) {
          delete next.estimateHours
        }
        return next
      })
      if (nextEstimate === 0 && current.start !== null) {
        const root = rootIdOf(tasks, action.taskId)
        tasks = tasks.map((task) => {
          if (task.id === root) return { ...task, start: null, assigneeId: null }
          if (task.parentId === root) return { ...task, start: null }
          return task
        })
      }
      return { ...state, tasks }
    }
    case 'patch-plan-settings': {
      const workDayHours =
        action.patch.workDayHours !== undefined
          ? Math.min(24, Math.max(0.5, action.patch.workDayHours))
          : state.workDayHours
      const velocity =
        action.patch.velocity !== undefined
          ? Math.min(5, Math.max(0.05, action.patch.velocity))
          : state.velocity
      if (workDayHours === state.workDayHours && velocity === state.velocity) return state
      return {
        ...state,
        workDayHours,
        velocity,
        tasks: applyEstimateSettings(state.tasks, workDayHours, velocity),
      }
    }
    case 'add-subtask': {
      const parent = state.tasks.find((t) => t.id === action.parentId)
      const existing = state.tasks.filter((t) => t.parentId === action.parentId)
      const child: Task = {
        id: uid(),
        title: existing.length === 0 ? parent?.title ?? 'Подзадача' : `Подзадача ${existing.length + 1}`,
        estimateDays: existing.length === 0 ? Math.max(0, parent?.estimateDays ?? 0) : 2,
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
    case 'toggle-person-timeline': {
      return {
        ...state,
        people: state.people.map((person) =>
          person.id === action.personId
            ? { ...person, timelineHidden: !person.timelineHidden }
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
      const { tasks } = mergeImportedTasks(state.tasks, action.tasks)
      return { ...state, tasks }
    }
    case 'load-project':
      return normalizeLoadedState(action.project)
    case 'clear-project':
      return createEmptyProject()
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
  moveEpicStart: (taskId: Id, date: string) => void
  shiftPlanStart: (days: number) => void
  setPlanStart: (date: string) => void
  togglePersonTimeline: (personId: Id) => void
  unplace: (taskId: Id) => void
  patch: (taskId: Id, patch: Partial<Task>) => void
  patchPlanSettings: (patch: { workDayHours?: number; velocity?: number }) => void
  addSubtask: (parentId: Id) => void
  remove: (taskId: Id) => void
  toggleDep: (taskId: Id, depId: Id) => void
  addPerson: (name: string, role: string) => void
  patchPerson: (personId: Id, patch: { name?: string; role?: string }) => void
  removePerson: (personId: Id) => void
  importTasks: (tasks: Task[]) => { added: number; updated: number }
  importProject: (project: ProjectState) => void
  clearProject: () => void
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

  const moveEpicStart = useCallback((taskId: Id, date: string) => {
    dispatch({ type: 'move-epic', taskId, date })
    setSelectedId(taskId)
  }, [])

  const shiftPlanStart = useCallback((days: number) => {
    dispatch({ type: 'shift-plan-start', days })
  }, [])

  const setPlanStart = useCallback((date: string) => {
    dispatch({ type: 'set-plan-start', date })
  }, [])

  const togglePersonTimeline = useCallback((personId: Id) => {
    dispatch({ type: 'toggle-person-timeline', personId })
  }, [])

  const unplace = useCallback((taskId: Id) => {
    dispatch({ type: 'unplace', taskId })
    setDraggingId(null)
    setHover(null)
  }, [])

  const patch = useCallback((taskId: Id, patch: Partial<Task>) => {
    dispatch({ type: 'patch', taskId, patch })
  }, [])

  const patchPlanSettings = useCallback((patch: { workDayHours?: number; velocity?: number }) => {
    dispatch({ type: 'patch-plan-settings', patch })
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
    const { added, updated } = mergeImportedTasks(state.tasks, tasks)
    if (added > 0 || updated > 0) dispatch({ type: 'import-tasks', tasks })
    return { added, updated }
  }, [state.tasks])

  const importProject = useCallback((project: ProjectState) => {
    dispatch({ type: 'load-project', project })
    setSelectedId(null)
  }, [])

  const clearProject = useCallback(() => {
    dispatch({ type: 'clear-project' })
    setSelectedId(null)
  }, [])

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
      moveEpicStart,
      shiftPlanStart,
      setPlanStart,
      togglePersonTimeline,
      unplace,
      patch,
      patchPlanSettings,
      addSubtask,
      remove,
      toggleDep,
      addPerson,
      patchPerson,
      removePerson,
      importTasks,
      importProject,
      clearProject,
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
      moveEpicStart,
      shiftPlanStart,
      setPlanStart,
      togglePersonTimeline,
      unplace,
      patch,
      patchPlanSettings,
      addSubtask,
      remove,
      toggleDep,
      addPerson,
      patchPerson,
      removePerson,
      importTasks,
      importProject,
      clearProject,
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
