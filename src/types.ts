export type Id = string

export type Person = {
  id: Id
  name: string
  role: string
  color: string
  /** Скрыть дорожку на таймлайне (задачи остаются в плане). */
  timelineHidden?: boolean
}

/** Блокер из TFS, не импортированный в план (вне группы Child). */
export type ExternalBlocker = {
  tfsId: number
  title: string
  url: string
}

export type Task = {
  id: Id
  title: string
  /** Грубая оценка (для эпика) или длительность листа, в рабочих днях. 0 — без оценки. */
  estimateDays: number
  /** Сырая оценка в часах (из TFS). При смене длины дня / коэффициента дни пересчитываются. */
  estimateHours?: number
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
  /** Прямая ссылка на work item в TFS. */
  tfsUrl?: string
  /** Поля work item на момент последнего импорта из TFS. */
  tfsFields?: Record<string, unknown>
  /** Блокеры вне импортированной группы подзадач. */
  externalBlockers?: ExternalBlocker[]
  /**
   * Скрыть подзадачи на таймлайне: корневая задача планируется как цельная
   * оценка на выбранного исполнителя.
   */
  hideSubtasks?: boolean
}

export type ProjectState = {
  people: Person[]
  tasks: Task[]
  planStart: string
  /** Длина рабочего дня в часах (по умолчанию 8). */
  workDayHours: number
  /** Коэффициент выполнения: 0.5 → задача на 8 ч при дне 8 ч займёт 2 дня. */
  velocity: number
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
