import { nextWorkDay, parseISO, toISO, workDates, workDaysInclusive, addDays, isWeekend } from './dates'
import type { EpicStats, Id, Placement, ScheduleResult, Task } from './types'

function occupy(occupied: Set<string>, personId: Id, dates: string[]) {
  for (const date of dates) occupied.add(`${personId}:${date}`)
}

function findSlot(
  personId: Id,
  duration: number,
  notBefore: string,
  occupied: Set<string>,
): { start: string; end: string; dates: string[] } | null {
  let candidate = nextWorkDay(parseISO(notBefore))
  for (let i = 0; i < 400; i += 1) {
    const dates = workDates(candidate, Math.max(1, duration))
    if (dates.every((d) => !occupied.has(`${personId}:${d}`))) {
      return { start: dates[0], end: dates[dates.length - 1], dates }
    }
    candidate = nextWorkDay(addDays(candidate, 1))
  }
  return null
}

function topoSort(tasks: Task[]): Task[] | null {
  const ids = new Set(tasks.map((t) => t.id))
  const incoming = new Map<Id, number>()
  const outgoing = new Map<Id, Id[]>()
  for (const task of tasks) {
    const deps = task.dependsOn.filter((id) => ids.has(id))
    incoming.set(task.id, deps.length)
    outgoing.set(task.id, [])
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) continue
      outgoing.get(dep)!.push(task.id)
    }
  }
  const queue = tasks.filter((t) => incoming.get(t.id) === 0)
  const ordered: Task[] = []
  while (queue.length > 0) {
    const task = queue.shift()!
    ordered.push(task)
    for (const nextId of outgoing.get(task.id) ?? []) {
      const left = (incoming.get(nextId) ?? 1) - 1
      incoming.set(nextId, left)
      if (left === 0) {
        const next = tasks.find((t) => t.id === nextId)
        if (next) queue.push(next)
      }
    }
  }
  return ordered.length === tasks.length ? ordered : null
}

function latestStart(latestFinish: string, duration: number): string {
  let left = Math.max(1, duration)
  let d = parseISO(latestFinish)
  while (left > 0) {
    if (!isWeekend(d)) {
      left -= 1
      if (left === 0) return toISO(d)
    }
    d = addDays(d, -1)
  }
  return toISO(d)
}

function computeCritical(
  kids: Task[],
  placements: Record<Id, Placement>,
  epicEnd: string,
): Id[] {
  const placed = kids.filter((k) => placements[k.id])
  if (placed.length === 0) return []
  const ordered = topoSort(placed)
  if (!ordered) return []

  const successors = new Map<Id, Id[]>()
  for (const task of placed) successors.set(task.id, [])
  for (const task of placed) {
    for (const dep of task.dependsOn) {
      if (successors.has(dep)) successors.get(dep)!.push(task.id)
    }
  }

  const latestFinish: Record<Id, string> = {}
  for (const task of [...ordered].reverse()) {
    const succs = successors.get(task.id) ?? []
    if (succs.length === 0) {
      latestFinish[task.id] = epicEnd
      continue
    }
    let minFinish = epicEnd
    for (const succId of succs) {
      const succ = placed.find((t) => t.id === succId)!
      const succLatestStart = latestStart(latestFinish[succId], succ.estimateDays)
      const before = toISO(addDays(parseISO(succLatestStart), -1))
      if (before < minFinish) minFinish = before
    }
    latestFinish[task.id] = minFinish
  }

  return placed
    .filter((task) => placements[task.id].end >= latestFinish[task.id])
    .map((task) => task.id)
}

function childrenOf(tasks: Task[], id: Id): Task[] {
  return tasks.filter((t) => t.parentId === id)
}

export function wouldCycle(tasks: Task[], taskId: Id, depId: Id): boolean {
  if (taskId === depId) return true
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const stack = [depId]
  const seen = new Set<Id>()
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (!node) continue
    stack.push(...node.dependsOn)
  }
  return false
}

export function buildSchedule(tasks: Task[]): ScheduleResult {
  const occupied = new Set<string>()
  const placements: Record<Id, Placement> = {}
  const stats: Record<Id, EpicStats> = {}
  const errors: string[] = []

  const roots = tasks
    .filter((t) => t.parentId === null && t.start)
    .sort((a, b) => a.start!.localeCompare(b.start!) || a.id.localeCompare(b.id))

  for (const root of roots) {
    const kids = childrenOf(tasks, root.id)
    const asLeaf = kids.length === 0 || root.hideSubtasks

    if (asLeaf) {
      if (!root.assigneeId) {
        if (kids.length > 0 && root.hideSubtasks) {
          stats[root.id] = {
            taskId: root.id,
            sumParts: root.estimateDays,
            spanDays: 0,
            savedDays: 0,
            start: root.start,
            finish: null,
            cycle: false,
            unassigned: [root.id],
            critical: [],
          }
        }
        continue
      }
      if (root.estimateDays <= 0) continue
      const slot = findSlot(root.assigneeId, root.estimateDays, root.start!, occupied)
      if (!slot) {
        errors.push(`Не удалось уложить «${root.title}»`)
        continue
      }
      occupy(occupied, root.assigneeId, slot.dates)
      placements[root.id] = { taskId: root.id, assigneeId: root.assigneeId, ...slot }
      stats[root.id] = {
        taskId: root.id,
        sumParts: root.estimateDays,
        spanDays: root.estimateDays,
        savedDays: 0,
        start: slot.start,
        finish: slot.end,
        cycle: false,
        unassigned: [],
        critical: [root.id],
      }
      continue
    }

    const ordered = topoSort(kids)
    if (!ordered) {
      stats[root.id] = {
        taskId: root.id,
        sumParts: kids.reduce((s, k) => s + k.estimateDays, 0),
        spanDays: 0,
        savedDays: 0,
        start: root.start,
        finish: null,
        cycle: true,
        unassigned: kids.filter((k) => !k.assigneeId).map((k) => k.id),
        critical: [],
      }
      errors.push(`Цикл зависимостей в «${root.title}»`)
      continue
    }

    const unassigned: Id[] = []
    for (const child of ordered) {
      if (!child.assigneeId) {
        unassigned.push(child.id)
        continue
      }
      if (child.estimateDays <= 0) {
        unassigned.push(child.id)
        continue
      }
      let notBefore = parseISO(root.start!)
      for (const depId of child.dependsOn) {
        const dep = placements[depId]
        if (!dep) continue
        const after = addDays(parseISO(dep.end), 1)
        if (after > notBefore) notBefore = after
      }
      if (child.start) {
        const hint = parseISO(child.start)
        if (hint > notBefore) notBefore = hint
      }
      const slot = findSlot(child.assigneeId, child.estimateDays, toISO(notBefore), occupied)
      if (!slot) {
        errors.push(`Не удалось уложить «${child.title}»`)
        continue
      }
      occupy(occupied, child.assigneeId, slot.dates)
      placements[child.id] = { taskId: child.id, assigneeId: child.assigneeId, ...slot }
    }

    const placedKids = kids.map((k) => placements[k.id]).filter(Boolean)
    const sumParts = kids.reduce((s, k) => s + k.estimateDays, 0)
    let start: string | null = null
    let finish: string | null = null
    let spanDays = 0
    if (placedKids.length > 0) {
      start = placedKids.reduce((min, p) => (p.start < min ? p.start : min), placedKids[0].start)
      finish = placedKids.reduce((max, p) => (p.end > max ? p.end : max), placedKids[0].end)
      spanDays = workDaysInclusive(parseISO(start), parseISO(finish))
    }

    stats[root.id] = {
      taskId: root.id,
      sumParts,
      spanDays,
      savedDays: Math.max(0, sumParts - spanDays),
      start,
      finish,
      cycle: false,
      unassigned,
      critical: finish ? computeCritical(kids, placements, finish) : [],
    }
  }

  return { placements, stats, errors }
}

export function rootIdOf(tasks: Task[], taskId: Id): Id {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  let id = taskId
  while (byId.get(id)?.parentId) id = byId.get(id)!.parentId!
  return id
}
