import { formatFieldLabel, formatFieldValue } from './tfsFieldView'
import type { Task } from './types'

function fieldValueMatches(key: string, value: unknown, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return true

  if (formatFieldValue(key, value).toLowerCase().includes(n)) return true

  if (typeof value === 'string' && value.toLowerCase().includes(n)) return true
  if (typeof value === 'number' && String(value).includes(n)) return true
  if (typeof value === 'boolean') {
    const label = value ? 'да' : 'нет'
    if (label.includes(n) || String(value).includes(n)) return true
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (typeof record.displayName === 'string' && record.displayName.toLowerCase().includes(n)) {
      return true
    }
    if (typeof record.uniqueName === 'string' && record.uniqueName.toLowerCase().includes(n)) {
      return true
    }
  }

  return false
}

function resolveFieldKey(fieldQuery: string, fields: Record<string, unknown>): string | null {
  const q = fieldQuery.trim().toLowerCase()
  if (!q) return null

  for (const key of Object.keys(fields)) {
    if (key.toLowerCase() === q) return key
  }

  for (const key of Object.keys(fields)) {
    if (formatFieldLabel(key).toLowerCase() === q) return key
  }

  const partial = Object.keys(fields).filter((key) => {
    const keyLower = key.toLowerCase()
    const labelLower = formatFieldLabel(key).toLowerCase()
    return keyLower.includes(q) || labelLower.includes(q)
  })
  if (partial.length === 1) return partial[0]

  return null
}

function matchesTfsFieldFilter(task: Task, fieldQuery: string, valueQuery: string): boolean {
  if (!task.tfsFields) return false
  const key = resolveFieldKey(fieldQuery, task.tfsFields)
  if (!key) return false
  return fieldValueMatches(key, task.tfsFields[key], valueQuery)
}

function matchesPlainSearch(task: Task, needle: string): boolean {
  const n = needle.toLowerCase()
  if (task.title.toLowerCase().includes(n)) return true
  if (task.tfsId != null && String(task.tfsId).includes(n)) return true

  if (task.tfsFields) {
    for (const [key, value] of Object.entries(task.tfsFields)) {
      if (fieldValueMatches(key, value, needle)) return true
      if (key.toLowerCase().includes(n)) return true
      if (formatFieldLabel(key).toLowerCase().includes(n)) return true
    }
  }

  return false
}

export const ROADMAP_STATE_FIELD = 'Roadmap State'

export function taskRoadmapState(task: Task): string | null {
  const fields = task.tfsFields
  if (!fields) return null
  const value = fields[ROADMAP_STATE_FIELD]
  if (value == null || value === '') return null
  const text = formatFieldValue(ROADMAP_STATE_FIELD, value).trim()
  if (!text || text === '—') return null
  return text
}

export function matchesRoadmapState(task: Task, selected: string): boolean {
  if (!selected) return true
  return taskRoadmapState(task) === selected
}

export function matchesTaskSearch(task: Task, query: string): boolean {
  const raw = query.trim()
  if (!raw) return true

  const colon = raw.indexOf(':')
  if (colon >= 0) {
    const fieldQuery = raw.slice(0, colon).trim()
    const valueQuery = raw.slice(colon + 1).trim()
    if (fieldQuery) return matchesTfsFieldFilter(task, fieldQuery, valueQuery)
  }

  return matchesPlainSearch(task, raw)
}
