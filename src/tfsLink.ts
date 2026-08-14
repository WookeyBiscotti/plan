import { workItemWebUrl, type TfsConfig } from './tfsApi'
import { importKey } from './tfsImport'
import type { Task } from './types'

const CONFIG_KEY = 'team-plan-tfs-config'

export function readTfsBaseUrl(): string | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const config = JSON.parse(raw) as TfsConfig
    const baseUrl = config.baseUrl?.trim()
    return baseUrl || null
  } catch {
    return null
  }
}

export function taskTfsId(task: Task): number | null {
  if (typeof task.tfsId === 'number' && Number.isFinite(task.tfsId)) return task.tfsId
  return importKey(task)
}

export function taskTfsUrl(task: Task): string | null {
  if (task.tfsUrl) return task.tfsUrl
  const id = taskTfsId(task)
  if (id == null) return null
  const baseUrl = readTfsBaseUrl()
  if (!baseUrl) return null
  return workItemWebUrl(baseUrl, id)
}
