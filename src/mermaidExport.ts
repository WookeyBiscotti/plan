import { epicColor } from './timelineView'
import type { Id, Person, ProjectState, ScheduleResult, Task } from './types'

type ColorRule = {
  mermaidId: string
  color: string
}

function escapeMermaidText(text: string): string {
  return text
    .replace(/:/g, ' - ')
    .replace(/#/g, '')
    .replace(/;/g, ',')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    if (parent) return `${parent.title} / ${task.title}`
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
  taskId: Id,
  start: string,
  durationDays: number,
  critical: boolean,
): string {
  const id = mermaidTaskId(taskId)
  const duration = `${durationDays}d`
  if (critical) return `    ${title} :crit, ${id}, ${start}, ${duration}`
  return `    ${title} :${id}, ${start}, ${duration}`
}

function dependencyComment(task: Task, tasks: Map<Id, Task>): string | null {
  if (task.dependsOn.length === 0) return null
  const names = task.dependsOn
    .map((id) => tasks.get(id)?.title)
    .filter((name): name is string => Boolean(name))
  if (names.length === 0) return null
  return `    %% зависит от: ${names.join(', ')}`
}

function pushColorRule(rules: ColorRule[], taskId: Id, color: string): void {
  rules.push({ mermaidId: mermaidTaskId(taskId), color })
}

function buildInitDirective(colorRules: ColorRule[]): string {
  const themeCss = colorRules
    .map(
      ({ mermaidId, color }) =>
        `rect#${mermaidId} { fill: ${color} !important; stroke: ${color} !important; }`,
    )
    .join(' ')

  return `%%{init: ${JSON.stringify({
    locale: 'ru',
    themeCSS: themeCss,
    gantt: { topAxis: true },
  })}}%%`
}

export function serializeMermaidGantt(project: ProjectState, schedule: ScheduleResult): string {
  const tasks = taskById(project.tasks)
  const critical = criticalTaskIds(schedule)
  const colorRules: ColorRule[] = []

  const lines = [
    'gantt',
    '    dateFormat YYYY-MM-DD',
    '    axisFormat %B %Y',
    '    tickInterval 1month',
    '    weekday monday',
    '    title План команды',
    '    excludes weekends',
    '',
  ]

  if (schedule.errors.length > 0) {
    lines.push(`    %% scheduling errors: ${schedule.errors.join('; ')}`, '')
  }

  const epicTasks = project.tasks.filter(
    (task) =>
      task.parentId === null &&
      task.start &&
      !task.hideSubtasks &&
      project.tasks.some((child) => child.parentId === task.id),
  )

  const epicLines: string[] = []
  for (const epic of epicTasks) {
    const stats = schedule.stats[epic.id]
    if (!stats?.start || !stats.finish || stats.spanDays <= 0) continue
    const summaryId = `${epic.id}_summary`
    pushColorRule(colorRules, summaryId, epicColor(epic.id))
    const title = escapeMermaidText(epic.title)
    epicLines.push(
      formatTaskLine(title, summaryId, stats.start, stats.spanDays, stats.critical.length > 0),
    )
  }
  if (epicLines.length > 0) {
    lines.push('    section Эпики', ...epicLines, '')
  }

  const visiblePeople = project.people.filter((person) => !person.timelineHidden)
  for (const person of visiblePeople) {
    appendPersonSection(lines, person, schedule, tasks, critical, colorRules)
  }

  const body = [buildInitDirective(colorRules), ...lines].join('\n').trimEnd()
  return `\`\`\`mermaid\n${body}\n\`\`\`\n`
}

function appendPersonSection(
  lines: string[],
  person: Person,
  schedule: ScheduleResult,
  tasks: Map<Id, Task>,
  critical: Set<Id>,
  colorRules: ColorRule[],
): void {
  const exportableTaskIds = new Set(
    Object.values(schedule.placements)
      .filter((placement) => {
        const task = tasks.get(placement.taskId)
        return task && isLeafPlacement(task, tasks)
      })
      .map((placement) => placement.taskId),
  )

  const placements = Object.values(schedule.placements)
    .filter((placement) => placement.assigneeId === person.id)
    .filter((placement) => exportableTaskIds.has(placement.taskId))
    .sort((a, b) => a.start.localeCompare(b.start) || a.taskId.localeCompare(b.taskId))

  if (placements.length === 0) return

  lines.push(`    section ${escapeMermaidText(person.name)}`)
  for (const placement of placements) {
    const task = tasks.get(placement.taskId)
    if (!task) continue

    const comment = dependencyComment(task, tasks)
    if (comment) lines.push(comment)

    pushColorRule(colorRules, task.id, person.color)
    const title = escapeMermaidText(taskDisplayTitle(task, tasks))
    lines.push(
      formatTaskLine(title, task.id, placement.start, placement.dates.length, critical.has(task.id)),
    )
  }
  lines.push('')
}

export function downloadMermaidGantt(
  project: ProjectState,
  schedule: ScheduleResult,
  filename?: string,
): void {
  const text = serializeMermaidGantt(project, schedule)
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename ?? `plan-${project.planStart}.md`
  link.click()
  URL.revokeObjectURL(url)
}
