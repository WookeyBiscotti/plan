const FIELD_ORDER = [
  'System.Id',
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'State',
  'Roadmap State',
  'System.AssignedTo',
  'System.AreaPath',
  'System.IterationPath',
  'System.Tags',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.CompletedWork',
  'Estimation Ready Date',
  'System.CreatedDate',
  'System.ChangedDate',
  'System.CreatedBy',
  'System.ChangedBy',
  'System.Description',
]

const FIELD_LABELS: Record<string, string> = {
  'System.Id': 'ID',
  'System.WorkItemType': 'Тип',
  'System.Title': 'Название',
  'System.State': 'System.State',
  State: 'State',
  'Roadmap State': 'Roadmap State',
  'System.AssignedTo': 'Исполнитель',
  'System.AreaPath': 'Area Path',
  'System.IterationPath': 'Iteration Path',
  'System.Tags': 'Теги',
  'System.Description': 'Описание',
  'System.CreatedDate': 'Создано',
  'System.ChangedDate': 'Изменено',
  'System.CreatedBy': 'Автор',
  'System.ChangedBy': 'Изменил',
  'Microsoft.VSTS.Scheduling.StoryPoints': 'Story Points',
  'Microsoft.VSTS.Scheduling.OriginalEstimate': 'Оценка, ч',
  'Microsoft.VSTS.Scheduling.RemainingWork': 'Осталось, ч',
  'Microsoft.VSTS.Scheduling.CompletedWork': 'Факт, ч',
  'Estimation Ready Date': 'Estimation Ready Date',
}

function stripHtml(html: string): string {
  if (!html.trim()) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function prettifyKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const tail = key.includes('.') ? key.split('.').pop()! : key
  return tail.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function formatFieldLabel(key: string): string {
  return prettifyKey(key)
}

export function formatFieldValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—'

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.displayName === 'string') return record.displayName
    if (typeof record.uniqueName === 'string') return record.uniqueName
    if (Array.isArray(value)) return value.map((item) => formatFieldValue(key, item)).join(', ')
    return JSON.stringify(value, null, 2)
  }

  if (typeof value === 'string') {
    if (key === 'System.Description' || /<[a-z][\s\S]*>/i.test(value)) {
      const text = stripHtml(value)
      return text || '—'
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return new Date(value).toLocaleString('ru-RU')
      } catch {
        return value
      }
    }
    return value
  }

  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

export function isLongField(key: string, value: unknown): boolean {
  if (key === 'System.Description') return true
  const text = formatFieldValue(key, value)
  return text.length > 120 || text.includes('\n')
}

export function listFieldEntries(fields: Record<string, unknown>): Array<[string, unknown]> {
  const keys = Object.keys(fields)
  const rank = new Map(FIELD_ORDER.map((key, index) => [key, index]))
  return keys
    .sort((a, b) => {
      const ra = rank.get(a) ?? 999
      const rb = rank.get(b) ?? 999
      if (ra !== rb) return ra - rb
      return a.localeCompare(b, 'ru')
    })
    .map((key) => [key, fields[key]])
}

export function hasTfsFields(task: { tfsFields?: Record<string, unknown> }): boolean {
  return !!task.tfsFields && Object.keys(task.tfsFields).length > 0
}

function looksLikeReadyDateKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[._]/g, ' ')
  return (
    normalized === 'estimation ready date' ||
    normalized.endsWith(' estimation ready date') ||
    normalized.endsWith('estimationreadydate')
  )
}

function isoDateFromField(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    return match?.[1] ?? null
  }
  return null
}

/** ISO-дата Estimation Ready Date из полей TFS, если есть. */
export function taskEstimationReadyDate(task: {
  tfsFields?: Record<string, unknown>
}): string | null {
  const fields = task.tfsFields
  if (!fields) return null
  const direct = isoDateFromField(fields['Estimation Ready Date'])
  if (direct) return direct
  for (const [key, value] of Object.entries(fields)) {
    if (!looksLikeReadyDateKey(key)) continue
    const iso = isoDateFromField(value)
    if (iso) return iso
  }
  return null
}
