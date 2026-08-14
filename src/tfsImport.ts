import { extractBlockerIds, extractChildIds, workItemWebUrl, type WorkItem } from './tfsApi'
import type { ExternalBlocker, Id, Person, Task } from './types'

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

function buildExternalBlocker(
  id: number,
  byId: Map<number, WorkItem>,
  baseUrl: string,
): ExternalBlocker {
  const item = byId.get(id)
  const rawTitle = item ? fieldText(item.fields, 'System.Title') : ''
  return {
    tfsId: id,
    title: rawTitle ? `#${id} ${rawTitle}` : `#${id}`,
    url: workItemWebUrl(baseUrl, id),
  }
}

function toTask(
  item: WorkItem,
  dependsOn: Id[],
  days: number,
  assigneeId: Id | null,
  externalBlockers: ExternalBlocker[],
): Task {
  const title = fieldText(item.fields, 'System.Title') || `Задача ${item.id}`
  const task: Task = {
    id: tfsTaskId(item.id),
    title: `#${item.id} ${title}`,
    estimateDays: days,
    parentId: null,
    assigneeId,
    dependsOn,
    start: null,
    tfsId: item.id,
    tfsFields: { ...item.fields },
  }
  if (externalBlockers.length > 0) task.externalBlockers = externalBlockers
  return task
}

export function importKey(task: Task): number | null {
  if (typeof task.tfsId === 'number' && Number.isFinite(task.tfsId)) return task.tfsId
  const match = /^tfs-(\d+)$/.exec(task.id)
  return match ? Number.parseInt(match[1], 10) : null
}

export type ImportMergeResult = {
  tasks: Task[]
  added: number
  updated: number
}

export function mergeImportedTasks(existing: Task[], incoming: Task[]): ImportMergeResult {
  if (incoming.length === 0) return { tasks: existing, added: 0, updated: 0 }

  const existingByTfs = new Map<number, Task>()
  const existingById = new Map(existing.map((task) => [task.id, task]))
  for (const task of existing) {
    const key = importKey(task)
    if (key != null) existingByTfs.set(key, task)
  }

  const incomingToLocalId = new Map<Id, Id>()
  for (const task of incoming) {
    const key = importKey(task)
    const previous = (key != null ? existingByTfs.get(key) : undefined) ?? existingById.get(task.id)
    incomingToLocalId.set(task.id, previous?.id ?? task.id)
  }

  const rewrite = (id: Id): Id => incomingToLocalId.get(id) ?? id
  const mergedByLocalId = new Map<Id, Task>()
  let added = 0
  let updated = 0

  for (const task of incoming) {
    const localId = rewrite(task.id)
    const previous = existingById.get(localId)
    const merged: Task = {
      ...(previous ?? task),
      id: localId,
      tfsId: task.tfsId ?? previous?.tfsId ?? importKey(task) ?? undefined,
      tfsFields: task.tfsFields ?? previous?.tfsFields,
      title: task.title,
      estimateDays: task.estimateDays,
      parentId: null,
      dependsOn: task.dependsOn.map(rewrite),
      externalBlockers: task.externalBlockers ?? previous?.externalBlockers,
      start: previous?.start ?? task.start,
      assigneeId: previous?.assigneeId ?? task.assigneeId,
    }
    if (!merged.externalBlockers?.length) delete merged.externalBlockers
    mergedByLocalId.set(localId, merged)
    if (previous) updated += 1
    else added += 1
  }

  const known = new Set<Id>([...existing.map((task) => task.id), ...mergedByLocalId.keys()])
  const next: Task[] = existing.map((task) => {
    const merged = mergedByLocalId.get(task.id)
    if (!merged) return task
    mergedByLocalId.delete(task.id)
    return { ...merged, dependsOn: merged.dependsOn.filter((id) => known.has(id)) }
  })
  for (const task of incoming) {
    const localId = rewrite(task.id)
    const leftover = mergedByLocalId.get(localId)
    if (!leftover) continue
    mergedByLocalId.delete(localId)
    next.push({ ...leftover, dependsOn: leftover.dependsOn.filter((id) => known.has(id)) })
  }

  return { tasks: next, added, updated }
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
  baseUrl: string,
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
        toTask(
          root,
          [],
          estimateDays(root),
          matchAssignee(people, root.fields['System.AssignedTo']),
          [],
        ),
      )
      rootCount += 1
      continue
    }

    const siblingIds = new Set(childItems.map((item) => item.id))
    for (const child of childItems) {
      const blockerIds = extractBlockerIds(child)
      const dependsOn = blockerIds
        .filter((id) => siblingIds.has(id) && id !== child.id)
        .map(tfsTaskId)
      const externalBlockers = blockerIds
        .filter((id) => !siblingIds.has(id))
        .map((id) => buildExternalBlocker(id, byId, baseUrl))
      tasks.push(
        toTask(
          child,
          dependsOn,
          estimateDays(child),
          matchAssignee(people, child.fields['System.AssignedTo']),
          externalBlockers,
        ),
      )
      childCount += 1
    }
  }

  return { tasks, rootCount, childCount }
}

export function hasExternalBlockers(task: Task): boolean {
  return (task.externalBlockers?.length ?? 0) > 0
}
