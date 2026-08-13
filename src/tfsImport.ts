import { extractBlockerIds, extractChildIds, type WorkItem } from './tfsApi'
import type { Id, Person, Task } from './types'

export const TFS_ID_PREFIX = 'tfs-'

export function tfsTaskId(workItemId: number): Id {
  return `${TFS_ID_PREFIX}${workItemId}`
}

function fieldText(fields: WorkItem['fields'], key: string): string {
  const value = fields[key]
  if (value == null || value === '') return ''
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.displayName === 'string') return record.displayName
    if (typeof record.uniqueName === 'string') return record.uniqueName
  }
  return String(value)
}

function fieldNumber(fields: WorkItem['fields'], key: string): number | null {
  const value = fields[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function estimateDays(item: WorkItem): number {
  const hours =
    fieldNumber(item.fields, 'Microsoft.VSTS.Scheduling.OriginalEstimate') ??
    fieldNumber(item.fields, 'Microsoft.VSTS.Scheduling.RemainingWork')
  if (hours != null && hours > 0) return Math.max(1, Math.round(hours / 8))

  const points = fieldNumber(item.fields, 'Microsoft.VSTS.Scheduling.StoryPoints')
  if (points != null && points > 0) return Math.max(1, Math.round(points))

  return 1
}

function matchAssignee(people: Person[], assignedTo: unknown): Id | null {
  if (assignedTo == null) return null
  const name =
    typeof assignedTo === 'object' && assignedTo !== null
      ? String(
          (assignedTo as { displayName?: string }).displayName ??
            (assignedTo as { uniqueName?: string }).uniqueName ??
            '',
        ).trim()
      : String(assignedTo).trim()
  if (!name) return null

  const normalized = name.toLowerCase()
  const exact = people.find((person) => person.name.trim().toLowerCase() === normalized)
  if (exact) return exact.id

  const sorted = normalized.split(/\s+/).sort().join(' ')
  const fuzzy = people.find((person) => person.name.trim().toLowerCase().split(/\s+/).sort().join(' ') === sorted)
  return fuzzy?.id ?? null
}

function toTask(item: WorkItem, parentId: Id | null, dependsOn: Id[], days: number, assigneeId: Id | null): Task {
  const title = fieldText(item.fields, 'System.Title') || `Задача ${item.id}`
  return {
    id: tfsTaskId(item.id),
    title: `#${item.id} ${title}`,
    estimateDays: days,
    parentId,
    assigneeId,
    dependsOn,
    start: null,
  }
}

export type TfsImportResult = {
  tasks: Task[]
  rootCount: number
  childCount: number
}

export function mapWorkItemsToTasks(
  roots: WorkItem[],
  byId: Map<number, WorkItem>,
  people: Person[],
): TfsImportResult {
  const tasks: Task[] = []
  let rootCount = 0
  let childCount = 0

  for (const root of roots) {
    const childItems = extractChildIds(root)
      .map((id) => byId.get(id))
      .filter((item): item is WorkItem => item != null)

    if (childItems.length === 0) {
      tasks.push(
        toTask(root, null, [], estimateDays(root), matchAssignee(people, root.fields['System.AssignedTo'])),
      )
      rootCount += 1
      continue
    }

    const siblingIds = new Set(childItems.map((item) => item.id))
    const parentEstimate = childItems.reduce((sum, item) => sum + estimateDays(item), 0)
    tasks.push(toTask(root, null, [], Math.max(1, parentEstimate), null))
    rootCount += 1

    for (const child of childItems) {
      const dependsOn = extractBlockerIds(child)
        .filter((id) => siblingIds.has(id) && id !== child.id)
        .map(tfsTaskId)
      tasks.push(
        toTask(
          child,
          tfsTaskId(root.id),
          dependsOn,
          estimateDays(child),
          matchAssignee(people, child.fields['System.AssignedTo']),
        ),
      )
      childCount += 1
    }
  }

  return { tasks, rootCount, childCount }
}
