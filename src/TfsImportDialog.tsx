import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePlan } from './store'
import { loadWorkItemsForImport, parseList, type TfsConfig } from './tfsApi'
import { mapWorkItemsToTasks } from './tfsImport'

const CONFIG_KEY = 'team-plan-tfs-config'
const QUERY_KEY = 'team-plan-tfs-query'

type StoredQuery = {
  workItemType: string
  areaPath: string
  status: string
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
  const [status, setStatus] = useState('')
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
    setStatus(query?.status ?? '')
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
    const states = parseList(status)
    if (!config.baseUrl || !config.pat) {
      setError('Укажите Base URL и Personal Access Token')
      return
    }
    if (!area) {
      setError('Укажите Area Path')
      return
    }
    if (states.length === 0) {
      setError('Укажите статус')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      localStorage.setItem(
        QUERY_KEY,
        JSON.stringify({ workItemType: type, areaPath: area, status: status.trim() }),
      )
      const { roots, byId } = await loadWorkItemsForImport(config, {
        workItemType: type,
        areaPath: area,
        states,
      })
      const mapped = mapWorkItemsToTasks(roots, byId, state.people)
      const added = importTasks(mapped.tasks)
      if (mapped.tasks.length === 0) {
        setInfo('По заданным фильтрам задач не найдено.')
      } else if (added === 0) {
        setInfo(`Все ${mapped.tasks.length} задач уже есть в плане.`)
      } else {
        setInfo(
          `Добавлено ${added}: ${mapped.rootCount} основных, ${mapped.childCount} подзадач` +
            (added < mapped.tasks.length ? ` · пропущено ${mapped.tasks.length - added} уже существующих` : ''),
        )
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
            Задачи выбранного типа из Area Path. Если у задачи есть Child — она считается
            декомпозированной, подзадачи и связи Blocked By тоже попадут в план.
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
            Статус
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Active"
              disabled={loading}
              required
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
