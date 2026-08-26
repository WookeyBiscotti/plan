import { addDays, DAY_MS, parseISO, toISO, workDates } from './dates'
import { taskEstimationReadyDate } from './tfsFieldView'
import type { Id, Placement, Task } from './types'

export const DEFAULT_DAY_W = 34
export const TIMELINE_DAYS = 120

export const DAY_WIDTH_PRESETS = [
  { id: 'large', label: 'Крупно', width: 42 },
  { id: 'normal', label: 'Обычный', width: 34 },
  { id: 'compact', label: 'Компакт', width: 22 },
  { id: 'overview', label: 'Обзор', width: 14 },
] as const

export type DayWidthPresetId = (typeof DAY_WIDTH_PRESETS)[number]['id']

const DAY_WIDTH_KEY = 'team-plan-day-width'

export const EPIC_COLORS = [
  '#c45c26',
  '#4f7f8b',
  '#8b6b4f',
  '#5c6b4a',
  '#7a4e5c',
  '#3f5f7a',
  '#9a7b4f',
  '#6b5c8b',
  '#4a7a6b',
  '#8b4a5c',
]

export function readDayWidth(): number {
  try {
    const raw = localStorage.getItem(DAY_WIDTH_KEY)
    if (!raw) return DEFAULT_DAY_W
    const parsed = Number.parseInt(raw, 10)
    if (DAY_WIDTH_PRESETS.some((preset) => preset.width === parsed)) return parsed
  } catch {
    /* ignore */
  }
  return DEFAULT_DAY_W
}

export function writeDayWidth(width: number): void {
  localStorage.setItem(DAY_WIDTH_KEY, String(width))
}

export function epicColor(taskId: Id): string {
  let hash = 0
  for (let i = 0; i < taskId.length; i++) hash = (hash * 31 + taskId.charCodeAt(i)) | 0
  return EPIC_COLORS[Math.abs(hash) % EPIC_COLORS.length]
}

export function barStyle(days: Date[], start: string, end: string, dayW: number) {
  if (days.length === 0) return null
  const first = toISO(days[0])
  const last = toISO(days[days.length - 1])
  if (end < first || start > last) return null
  const clampedStart = start < first ? first : start
  const clampedEnd = end > last ? last : end
  const startI = days.findIndex((d) => toISO(d) === clampedStart)
  const endI = days.findIndex((d) => toISO(d) === clampedEnd)
  if (startI < 0 || endI < 0) return null
  return {
    left: startI * dayW + 3,
    width: Math.max(dayW - 6, (endI - startI + 1) * dayW - 6),
  }
}

/** Сколько календарных дней показать, чтобы эпики и задачи не обрезались. */
export function timelineDayCount(
  planStart: string,
  tasks: Task[],
  placements: Record<Id, Placement>,
): number {
  let last = toISO(addDays(parseISO(planStart), TIMELINE_DAYS - 1))
  const consider = (iso: string | null | undefined) => {
    if (iso && iso > last) last = iso
  }
  for (const task of tasks) {
    consider(taskEstimationReadyDate(task))
    if (!task.start || task.estimateDays <= 0) continue
    consider(task.start)
    consider(workDates(parseISO(task.start), task.estimateDays).at(-1) ?? null)
  }
  for (const placement of Object.values(placements)) {
    consider(placement.start)
    consider(placement.end)
  }
  const extra = Math.round((parseISO(last).getTime() - parseISO(planStart).getTime()) / DAY_MS) + 1
  return Math.max(TIMELINE_DAYS, extra + 14)
}

export function dateFromPoint(body: HTMLElement, clientX: number, days: Date[], dayW: number): string {
  const rect = body.getBoundingClientRect()
  const x = clientX - rect.left
  const index = Math.min(days.length - 1, Math.max(0, Math.floor(x / dayW)))
  return toISO(days[index])
}
