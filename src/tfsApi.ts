export interface TfsConfig {
  baseUrl: string
  pat: string
}

export interface TfsImportQuery {
  workItemType: string
  areaPath: string
  states: string[]
  roadmapStates: string[]
}

export type WorkItemFields = Record<string, unknown>

export interface WorkItemRelation {
  rel: string
  url: string
}

export interface WorkItem {
  id: number
  url: string
  fields: WorkItemFields
  relations?: WorkItemRelation[]
}

const API_VERSION = '6.0'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function authHeader(pat: string): string {
  return `Basic ${btoa(`:${pat}`)}`
}

function escapeWiql(value: string): string {
  return value.replace(/'/g, "''")
}

export function parseList(input: string): string[] {
  const result: string[] = []
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (trimmed && !result.includes(trimmed)) result.push(trimmed)
  }
  return result
}

async function tfsFetch(config: TfsConfig, path: string, init?: RequestInit): Promise<Response> {
  const target = `${normalizeBaseUrl(config.baseUrl)}${path}`
  const useProxy = import.meta.env.DEV
  const response = await fetch(useProxy ? '/__tfs-proxy' : target, {
    ...init,
    headers: {
      Authorization: authHeader(config.pat),
      'Content-Type': 'application/json',
      ...(useProxy ? { 'X-Tfs-Target': target } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`HTTP ${response.status}: ${body || response.statusText}`)
  }

  return response
}

function buildImportWiql(query: TfsImportQuery): string {
  const types = parseList(query.workItemType)
  const states = query.states
  const clauses = [`[System.AreaPath] UNDER '${escapeWiql(query.areaPath)}'`]

  if (types.length === 1) {
    clauses.push(`[System.WorkItemType] = '${escapeWiql(types[0])}'`)
  } else if (types.length > 1) {
    clauses.push(`[System.WorkItemType] IN (${types.map((t) => `'${escapeWiql(t)}'`).join(', ')})`)
  }

  if (states.length === 1) {
    clauses.push(`[State] = '${escapeWiql(states[0])}'`)
  } else if (states.length > 1) {
    clauses.push(`[State] IN (${states.map((s) => `'${escapeWiql(s)}'`).join(', ')})`)
  }

  const roadmapStates = query.roadmapStates
  if (roadmapStates.length === 1) {
    clauses.push(`[Roadmap State] = '${escapeWiql(roadmapStates[0])}'`)
  } else if (roadmapStates.length > 1) {
    clauses.push(
      `[Roadmap State] IN (${roadmapStates.map((s) => `'${escapeWiql(s)}'`).join(', ')})`,
    )
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' AND ')} ORDER BY [System.Id]`
}

async function queryWorkItemIds(config: TfsConfig, wiql: string): Promise<number[]> {
  const response = await tfsFetch(config, `/_apis/wit/wiql?api-version=${API_VERSION}`, {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  })
  const data = (await response.json()) as { workItems?: Array<{ id: number }> }
  return (data.workItems ?? []).map((item) => item.id)
}

export async function fetchWorkItemsBatch(config: TfsConfig, ids: number[]): Promise<WorkItem[]> {
  if (ids.length === 0) return []

  const items: WorkItem[] = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200)
    const response = await tfsFetch(config, `/_apis/wit/workitemsbatch?api-version=${API_VERSION}`, {
      method: 'POST',
      body: JSON.stringify({ ids: chunk, $expand: 'Relations' }),
    })
    const data = (await response.json()) as { value?: WorkItem[] }
    items.push(...(data.value ?? []))
  }
  return items.sort((a, b) => a.id - b.id)
}

export function workItemIdFromUrl(url: string): number | null {
  const httpsMatch = /\/workItems\/(\d+)(?:\?|$)/i.exec(url)
  if (httpsMatch) return Number.parseInt(httpsMatch[1], 10)
  const vstfsMatch = /\/WorkItem\/(\d+)$/i.exec(url)
  if (vstfsMatch) return Number.parseInt(vstfsMatch[1], 10)
  return null
}

export function extractChildIds(item: WorkItem): number[] {
  const ids: number[] = []
  for (const relation of item.relations ?? []) {
    if (relation.rel !== 'System.LinkTypes.Hierarchy-Forward') continue
    const id = workItemIdFromUrl(relation.url)
    if (id != null) ids.push(id)
  }
  return ids
}

/** Blocked By: задача ждёт указанные work items. */
export function extractBlockerIds(item: WorkItem): number[] {
  const ids: number[] = []
  for (const relation of item.relations ?? []) {
    if (
      relation.rel !== 'System.LinkTypes.Dependency-Reverse' &&
      relation.rel !== 'System.LinkTypes.Remote.Dependency-Reverse'
    ) {
      continue
    }
    const id = workItemIdFromUrl(relation.url)
    if (id != null) ids.push(id)
  }
  return ids
}

export async function loadWorkItemsForImport(
  config: TfsConfig,
  query: TfsImportQuery,
): Promise<{ roots: WorkItem[]; byId: Map<number, WorkItem> }> {
  const ids = await queryWorkItemIds(config, buildImportWiql(query))
  const queried = await fetchWorkItemsBatch(config, ids)
  const byId = new Map(queried.map((item) => [item.id, item]))

  const missing = new Set<number>()
  for (const item of queried) {
    for (const childId of extractChildIds(item)) {
      if (!byId.has(childId)) missing.add(childId)
    }
  }

  if (missing.size > 0) {
    const children = await fetchWorkItemsBatch(config, [...missing])
    for (const child of children) byId.set(child.id, child)
  }

  const queriedIds = new Set(queried.map((item) => item.id))
  const childOfQueried = new Set<number>()
  for (const item of queried) {
    for (const childId of extractChildIds(item)) {
      if (queriedIds.has(childId)) childOfQueried.add(childId)
    }
  }

  const roots = queried.filter((item) => !childOfQueried.has(item.id))
  return { roots, byId }
}
