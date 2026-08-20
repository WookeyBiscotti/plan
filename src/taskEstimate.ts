import type { Task } from './types'

export const DEFAULT_WORK_DAY_HOURS = 8
export const DEFAULT_VELOCITY = 1

/** Эффективных часов в рабочем дне с учётом коэффициента выполнения. */
export function effectiveDayHours(workDayHours: number, velocity: number): number {
  const day = Math.max(0.5, workDayHours)
  const rate = Math.max(0.05, velocity)
  return day * rate
}

/**
 * Часы → рабочие дни.
 * При velocity 0.5 и дне 8 ч задача на 8 ч займёт 2 дня.
 */
export function hoursToEstimateDays(
  hours: number,
  workDayHours: number,
  velocity: number,
): number {
  if (!(hours > 0)) return 0
  const perDay = effectiveDayHours(workDayHours, velocity)
  return Math.max(1, Math.ceil(hours / perDay - 1e-9))
}

export function readEstimateHours(task: Pick<Task, 'estimateHours' | 'tfsFields'>): number | null {
  if (typeof task.estimateHours === 'number' && Number.isFinite(task.estimateHours) && task.estimateHours > 0) {
    return task.estimateHours
  }
  const fields = task.tfsFields
  if (!fields) return null
  for (const key of [
    'Microsoft.VSTS.Scheduling.OriginalEstimate',
    'Microsoft.VSTS.Scheduling.RemainingWork',
  ]) {
    const value = fields[key]
    if (typeof value === 'number' && value > 0) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value.replace(',', '.'))
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

export function applyEstimateSettings(
  tasks: Task[],
  workDayHours: number,
  velocity: number,
): Task[] {
  return tasks.map((task) => {
    const hours = readEstimateHours(task)
    if (hours == null) return task
    const estimateDays = hoursToEstimateDays(hours, workDayHours, velocity)
    return { ...task, estimateHours: hours, estimateDays }
  })
}

/** Задача считается оценённой, если указана длительность больше нуля. */
export function isTaskEstimated(task: Pick<Task, 'estimateDays'>): boolean {
  return task.estimateDays > 0
}

export function canPlaceOnTimeline(task: Pick<Task, 'estimateDays'>): boolean {
  return isTaskEstimated(task)
}

export function estimateLabel(task: Pick<Task, 'estimateDays'>): string {
  return isTaskEstimated(task) ? `${task.estimateDays} дн` : 'Без оценки'
}
