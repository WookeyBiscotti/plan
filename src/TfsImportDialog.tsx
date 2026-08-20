import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePlan } from './store'
import { loadWorkItemsForImport, parseList, type TfsConfig } from './tfsApi'
import { mapWorkItemsToTasks } from './tfsImport'

const CONFIG_KEY = 'team-plan-tfs-config'
const QUERY_KEY = 'team-plan-tfs-query'

type StoredQuery = {
  workItemType: string
  areaPath: string
  state?: string
  status?: string
  roadmapState: string
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function TfsImportDialog() {
  const { state, importTasks } = usePlan()
  const [open, setOpen] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [pat, setPat] = useState('')
  const [workItemType, setWorkItemType] = useState('CR')
  const [areaPath, setAreaPath] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [roadmapState, setRoadmapState] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const stored = readJson<TfsConfig>(CONFIG_KEY)
    const query = readJson<StoredQuery>(QUERY_KEY)
    setBaseUrl(stored?.baseUrl ?? '')
    setPat(stored?.pat ?? '')
    setWorkItemType(query?.workItemType || 'CR')
    setAreaPath(query?.areaPath ?? '')
    setStateFilter(query?.state ?? query?.status ?? '')
    setRoadmapState(query?.roadmapState ?? '')
    setError('')
    setInfo('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const config: TfsConfig = { baseUrl: baseUrl.trim(), pat: pat.trim() }
    const type = workItemType.trim() || 'CR'
    const area = areaPath.trim()
    const states = parseList(stateFilter)
    const roadmapStates = parseList(roadmapState)
    if (!config.baseUrl || !config.pat) {
      setError('Укажите Base URL и Personal Access Token')
      return
    }
    if (!area) {
      setError('Укажите Area Path')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      localStorage.setItem(
        QUERY_KEY,
        JSON.stringify({
          workItemType: type,
          areaPath: area,
          state: stateFilter.trim(),
          roadmapState: roadmapState.trim(),
        }),
      )
      const { roots, byId } = await loadWorkItemsForImport(config, {
        workItemType: type,
        areaPath: area,
        states,
        roadmapStates,
      })
      const mapped = mapWorkItemsToTasks(
        roots,
        byId,
        state.people,
        config.baseUrl,
        state.workDayHours,
        state.velocity,
      )
      const { added, updated } = importTasks(mapped.tasks)
      if (mapped.tasks.length === 0) {
        setInfo('По заданным фильтрам задач не найдено.')
      } else {
        const parts: string[] = []
        if (added > 0) parts.push(`добавлено ${added}`)
        if (updated > 0) parts.push(`обновлено ${updated}`)
        const detail =
          mapped.childCount > 0
            ? `${mapped.rootCount} основных, ${mapped.childCount} подзадач`
            : `${mapped.rootCount} задач`
        setInfo(`${parts.join(', ')}: ${detail}`)
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="team-wrap" ref={root}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Импорт TFS
      </button>
      {open && (
        <form className="team-pop tfs-pop" onSubmit={onSubmit}>
          <p className="team-pop-lead">
            Задачи выбранного типа из Area Path. Если у задачи есть Child — импортируются
            родитель и подзадачи со связями Blocked By между ними.
          </p>

          <label>
            Base URL
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://tfs.example.com/tfs/collection/project"
              disabled={loading}
              required
            />
          </label>
          <label>
            Personal Access Token
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="PAT с правами Work Items (Read)"
              disabled={loading}
              required
            />
          </label>
          <label>
            Тип задачи
            <input
              value={workItemType}
              onChange={(e) => setWorkItemType(e.target.value)}
              placeholder="CR"
              disabled={loading}
            />
          </label>
          <label>
            Area Path
            <input
              value={areaPath}
              onChange={(e) => setAreaPath(e.target.value)}
              placeholder="IResearch\KSN-AMR"
              disabled={loading}
              required
            />
          </label>
          <label>
            State
            <input
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              placeholder="необязательно"
              disabled={loading}
            />
          </label>
          <label>
            Roadmap State
            <input
              value={roadmapState}
              onChange={(e) => setRoadmapState(e.target.value)}
              placeholder="необязательно"
              disabled={loading}
            />
          </label>

          {error && <p className="backlog-error tfs-msg">{error}</p>}
          {info && <p className="tfs-info">{info}</p>}

          <div className="tfs-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Загрузка…' : 'Импортировать'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
