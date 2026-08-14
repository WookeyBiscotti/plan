export type Id = string

export type Person = {
  id: Id
  name: string
  role: string
  color: string
}

export type Task = {
  id: Id
  title: string
  /** Грубая оценка (для эпика) или длительность листа, в рабочих днях. */
  estimateDays: number
  parentId: Id | null
  assigneeId: Id | null
  /** id задач, которые должны закончиться раньше этой. */
  dependsOn: Id[]
  /**
   * Якорь «не раньше».
   * У корневой задачи — дата, куда её бросили на таймлайн.
   * У подзадачи — необязательный сдвиг после перетаскивания.
   */
  start: string | null
  /** ID work item в TFS. По нему повторный импорт обновляет задачу, а не создаёт дубль. */
  tfsId?: number
}

export type ProjectState = {
  people: Person[]
  tasks: Task[]
  planStart: string
}

export type Placement = {
  taskId: Id
  assigneeId: Id
  start: string
  end: string
  dates: string[]
}

export type EpicStats = {
  taskId: Id
  sumParts: number
  spanDays: number
  savedDays: number
  start: string | null
  finish: string | null
  cycle: boolean
  unassigned: Id[]
  critical: Id[]
}

export type ScheduleResult = {
  placements: Record<Id, Placement>
  stats: Record<Id, EpicStats>
  errors: string[]
}
