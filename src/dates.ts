export const DAY_MS = 86_400_000

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function addDays(date: Date, n: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

export function nextWorkDay(date: Date): Date {
  let d = new Date(date)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

export function rangeDays(startIso: string, count: number): Date[] {
  const start = parseISO(startIso)
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function workDates(from: Date, duration: number): string[] {
  const dates: string[] = []
  let d = nextWorkDay(from)
  while (dates.length < duration) {
    if (!isWeekend(d)) dates.push(toISO(d))
    d = addDays(d, 1)
  }
  return dates
}

export function workDaysInclusive(start: Date, end: Date): number {
  let n = 0
  let d = new Date(start)
  while (d <= end) {
    if (!isWeekend(d)) n += 1
    d = addDays(d, 1)
  }
  return n
}

export function mondayOnOrBefore(iso: string): string {
  const d = parseISO(iso)
  const offset = (d.getDay() + 6) % 7
  return toISO(addDays(d, -offset))
}

export function daysLabel(n: number): string {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return `${n} день`
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return `${n} дня`
  return `${n} дней`
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric' }).format(date)
}

export function formatDayMonth(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parseISO(iso))
}

export function weekdayLetter(date: Date): string {
  return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][date.getDay()]
}

export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date)
}
