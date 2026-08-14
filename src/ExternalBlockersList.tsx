import type { ExternalBlocker } from './types'

type ExternalBlockersListProps = {
  blockers: ExternalBlocker[]
}

export function ExternalBlockersList({ blockers }: ExternalBlockersListProps) {
  if (blockers.length === 0) return null

  return (
    <div className="external-blockers">
      <p className="external-blockers-label">Внешние блокеры</p>
      <ul className="external-blockers-list">
        {blockers.map((blocker) => (
          <li key={blocker.tfsId} className="external-blocker-row">
            <span className="external-blocker-title">{blocker.title}</span>
            <a
              className="tfs-link"
              href={blocker.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`Открыть #${blocker.tfsId} в TFS`}
            >
              TFS ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
