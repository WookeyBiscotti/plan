import type { Id, Person, ProjectState, ScheduleResult, Task } from './types'

function escapeMermaidText(text: string): string {
  return text.replace(/:/g, '—').replace(/#/g, '').replace(/;/g, ',').replace(/\n/g, ' ')
}

function mermaidTaskId(id: Id): string {
  const safe = id.replace(/[^a-zA-Z0-9_]/g, '_')
  return /^[a-zA-Z_]/.test(safe) ? safe : `t_${safe}`
}

function taskById(tasks: Task[]): Map<Id, Task> {
  return new Map(tasks.map((task) => [task.id, task]))
}

function taskDisplayTitle(task: Task, tasks: Map<Id, Task>): string {
  if (task.parentId) {
    const parent = tasks.get(task.parentId)
    if (parent) return `${parent.title} → ${task.title}`
  }
  return task.title
}

function isLeafPlacement(task: Task, tasks: Map<Id, Task>): boolean {
  if (task.parentId) {
    const parent = tasks.get(task.parentId)
    return !parent?.hideSubtasks
  }
  return true
}

function criticalTaskIds(schedule: ScheduleResult): Set<Id> {
  const ids = new Set<Id>()
  for (const stats of Object.values(schedule.stats)) {
    for (const id of stats.critical) ids.add(id)
  }
  return ids
}

function formatTaskLine(
  title: string,
  id: Id,
  durationDays: number,
  start: string | null,
  afterIds: Id[],
  critical: boolean,
): string {
  const tags = critical ? 'crit, ' : ''
  const mermaidId = mermaidTaskId(id)
  const duration = `${durationDays}d`
  if (afterIds.length > 0) {
    const deps = afterIds.map(mermaidTaskId).join(' ')
    return `    ${title} :${tags}${mermaidId}, after ${deps}, ${duration}`
  }
  if (!start) return ''
  return `    ${title} :${tags}${mermaidId}, ${start}, ${duration}`
}

export function serializeMermaidGantt(project: ProjectState, schedule: ScheduleResult): string {
  const tasks = taskById(project.tasks)
  const critical = criticalTaskIds(schedule)
  const exportableTaskIds = new Set(
    Object.values(schedule.placements)
      .filter((placement) => {
        const task = tasks.get(placement.taskId)
        return task && isLeafPlacement(task, tasks)
      })
      .map((placement) => placement.taskId),
  )

  const lines = [
    'gantt',
    '    title План команды',
    '    dateFormat YYYY-MM-DD',
    '    axisFormat %d.%m',
    '    excludes weekends',
    '',
  ]

  if (schedule.errors.length > 0) {
    lines.push(`    %% Ошибки планирования: ${schedule.errors.join('; ')}`, '')
  }

  const epicTasks = project.tasks.filter(
    (task) =>
      task.parentId === null &&
      task.start &&
      !task.hideSubtasks &&
      project.tasks.some((child) => child.parentId === task.id),
  )

  if (epicTasks.length > 0) {
    lines.push('    section Эпики')
    for (const epic of epicTasks) {
      const stats = schedule.stats[epic.id]
      if (!stats?.start || !stats.finish || stats.spanDays <= 0) continue
      const title = escapeMermaidText(epic.title)
      const line = formatTaskLine(
        title,
        `${epic.id}_summary`,
        stats.spanDays,
        stats.start,
        [],
        stats.critical.length > 0,
      )
      if (line) lines.push(line)
    }
    lines.push('')
  }

  const visiblePeople = project.people.filter((person) => !person.timelineHidden)
  for (const person of visiblePeople) {
    appendPersonSection(lines, person, schedule, tasks, exportableTaskIds, critical)
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function appendPersonSection(
  lines: string[],
  person: Person,
  schedule: ScheduleResult,
  tasks: Map<Id, Task>,
  exportableTaskIds: Set<Id>,
  critical: Set<Id>,
): void {
  const placements = Object.values(schedule.placements)
    .filter((placement) => placement.assigneeId === person.id)
    .filter((placement) => exportableTaskIds.has(placement.taskId))
    .sort((a, b) => a.start.localeCompare(b.start) || a.taskId.localeCompare(b.taskId))

  if (placements.length === 0) return

  lines.push(`    section ${escapeMermaidText(person.name)}`)
  for (const placement of placements) {
    const task = tasks.get(placement.taskId)
    if (!task) continue

    const afterIds = task.dependsOn.filter((depId) => exportableTaskIds.has(depId))
    const title = escapeMermaidText(taskDisplayTitle(task, tasks))
    const line = formatTaskLine(
      title,
      task.id,
      placement.dates.length,
      placement.start,
      afterIds,
      critical.has(task.id),
    )
    if (line) lines.push(line)
  }
  lines.push('')
}

export function downloadMermaidGantt(
  project: ProjectState,
  schedule: ScheduleResult,
  filename?: string,
): void {
  const text = serializeMermaidGantt(project, schedule)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename ?? `plan-${project.planStart}.mmd`
  link.click()
  URL.revokeObjectURL(url)
}
