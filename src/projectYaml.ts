import { parse, stringify } from 'yaml'
import { mondayOnOrBefore, todayISO } from './dates'
import type { Id, Person, ProjectState, Task, ExternalBlocker } from './types'

export const PROJECT_YAML_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Поле «${field}» должно быть непустой строкой`)
  }
  return value.trim()
}

function readOptionalString(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error('Ожидается строка или null')
  return value
}

function readId(value: unknown, field: string): Id {
  return readString(value, field)
}

function readOptionalId(value: unknown): Id | null {
  if (value == null || value === '') return null
  return readId(value, 'id')
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Поле «${field}» должно быть числом`)
  }
  return value
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Ожидается число')
  }
  return value
}

function readStringList(value: unknown, field: string): Id[] {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`Поле «${field}» должно быть массивом`)
  return value.map((item, index) => readId(item, `${field}[${index}]`))
}

function parsePerson(value: unknown, index: number): Person {
  if (!isRecord(value)) throw new Error(`people[${index}]: ожидается объект`)
  const person: Person = {
    id: readId(value.id, `people[${index}].id`),
    name: readString(value.name, `people[${index}].name`),
    role: readString(value.role, `people[${index}].role`),
    color: readString(value.color, `people[${index}].color`),
  }
  if (value.timelineHidden === true) person.timelineHidden = true
  return person
}

function parseExternalBlocker(value: unknown, index: number, taskIndex: number): ExternalBlocker {
  if (!isRecord(value)) {
    throw new Error(`tasks[${taskIndex}].externalBlockers[${index}]: ожидается объект`)
  }
  return {
    tfsId: readNumber(value.tfsId, `tasks[${taskIndex}].externalBlockers[${index}].tfsId`),
    title: readString(value.title, `tasks[${taskIndex}].externalBlockers[${index}].title`),
    url: readString(value.url, `tasks[${taskIndex}].externalBlockers[${index}].url`),
  }
}

function parseTask(value: unknown, index: number): Task {
  if (!isRecord(value)) throw new Error(`tasks[${index}]: ожидается объект`)
  const task: Task = {
    id: readId(value.id, `tasks[${index}].id`),
    title: readString(value.title, `tasks[${index}].title`),
    estimateDays: Math.max(1, readNumber(value.estimateDays, `tasks[${index}].estimateDays`)),
    parentId: readOptionalId(value.parentId),
    assigneeId: readOptionalId(value.assigneeId),
    dependsOn: readStringList(value.dependsOn, `tasks[${index}].dependsOn`),
    start: readOptionalString(value.start),
  }
  const tfsId = readOptionalNumber(value.tfsId)
  if (tfsId != null) task.tfsId = tfsId
  const tfsUrl = readOptionalString(value.tfsUrl)
  if (tfsUrl) task.tfsUrl = tfsUrl
  if (isRecord(value.tfsFields)) task.tfsFields = value.tfsFields
  if (Array.isArray(value.externalBlockers)) {
    task.externalBlockers = value.externalBlockers.map((item, blockerIndex) =>
      parseExternalBlocker(item, blockerIndex, index),
    )
  }
  return task
}

function normalizeProject(project: ProjectState): ProjectState {
  const peopleIds = new Set(project.people.map((person) => person.id))
  const taskIds = new Set(project.tasks.map((task) => task.id))

  const tasks = project.tasks.map((task) => ({
    ...task,
    parentId: task.parentId && taskIds.has(task.parentId) ? task.parentId : null,
    assigneeId: task.assigneeId && peopleIds.has(task.assigneeId) ? task.assigneeId : null,
    dependsOn: task.dependsOn.filter((id) => taskIds.has(id) && id !== task.id),
    estimateDays: Math.max(1, task.estimateDays),
  }))

  return {
    planStart: project.planStart,
    people: project.people,
    tasks,
  }
}

export function parseProjectYaml(text: string): ProjectState {
  const decoded = parse(text)
  if (!isRecord(decoded)) {
    throw new Error('Ожидается YAML-объект проекта')
  }

  const version = decoded.version
  if (version != null && version !== PROJECT_YAML_VERSION) {
    throw new Error(`Неподдерживаемая версия файла: ${String(version)}`)
  }

  const peopleRaw = decoded.people
  const tasksRaw = decoded.tasks
  if (!Array.isArray(peopleRaw)) throw new Error('Поле people должно быть массивом')
  if (!Array.isArray(tasksRaw)) throw new Error('Поле tasks должно быть массивом')

  const planStart = readOptionalString(decoded.planStart) ?? mondayOnOrBefore(todayISO())
  const people = peopleRaw.map(parsePerson)
  const tasks = tasksRaw.map(parseTask)

  return normalizeProject({ planStart, people, tasks })
}

export function serializeProjectYaml(project: ProjectState): string {
  const payload = {
    version: PROJECT_YAML_VERSION,
    planStart: project.planStart,
    people: project.people.map(({ id, name, role, color, timelineHidden }) => {
      const row: Record<string, unknown> = { id, name, role, color }
      if (timelineHidden) row.timelineHidden = true
      return row
    }),
    tasks: project.tasks.map((task) => {
      const row: Record<string, unknown> = {
        id: task.id,
        title: task.title,
        estimateDays: task.estimateDays,
        parentId: task.parentId,
        assigneeId: task.assigneeId,
        dependsOn: task.dependsOn,
        start: task.start,
      }
      if (task.tfsId != null) row.tfsId = task.tfsId
      if (task.tfsUrl) row.tfsUrl = task.tfsUrl
      if (task.tfsFields && Object.keys(task.tfsFields).length > 0) row.tfsFields = task.tfsFields
      if (task.externalBlockers?.length) row.externalBlockers = task.externalBlockers
      return row
    }),
  }

  return stringify(payload, { lineWidth: 0 })
}

export function downloadProjectYaml(project: ProjectState, filename?: string): void {
  const yaml = serializeProjectYaml(project)
  const blob = new Blob([yaml], { type: 'application/x-yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename ?? `plan-${project.planStart}.yaml`
  link.click()
  URL.revokeObjectURL(url)
}
