import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

const BACKLOG_W_KEY = 'team-plan-backlog-w'
const PANEL_W_KEY = 'team-plan-panel-w'
const BACKLOG_VISIBLE_KEY = 'team-plan-backlog-visible'
const PANEL_VISIBLE_KEY = 'team-plan-panel-visible'

const DEFAULT_BACKLOG_W = 272
const DEFAULT_PANEL_W = 360
const MIN_BACKLOG_W = 200
const MIN_PANEL_W = 280
const MIN_TIMELINE_W = 320

function readWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeWidth(key: string, width: number) {
  localStorage.setItem(key, String(Math.round(width)))
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === '1' || raw === 'true'
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean) {
  localStorage.setItem(key, value ? '1' : '0')
}

type ResizeHandleProps = {
  onDrag: (deltaX: number) => void
  label: string
}

export function ResizeHandle({ onDrag, label }: ResizeHandleProps) {
  const lastX = useRef(0)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    lastX.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const delta = event.clientX - lastX.current
    if (delta === 0) return
    lastX.current = event.clientX
    onDrag(delta)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}

export function useLayoutPrefs() {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [backlogW, setBacklogW] = useState(() => readWidth(BACKLOG_W_KEY, DEFAULT_BACKLOG_W))
  const [panelW, setPanelW] = useState(() => readWidth(PANEL_W_KEY, DEFAULT_PANEL_W))
  const [showBacklog, setShowBacklog] = useState(() => readBool(BACKLOG_VISIBLE_KEY, true))
  const [showPanel, setShowPanel] = useState(() => readBool(PANEL_VISIBLE_KEY, true))

  useEffect(() => {
    writeWidth(BACKLOG_W_KEY, backlogW)
  }, [backlogW])

  useEffect(() => {
    writeWidth(PANEL_W_KEY, panelW)
  }, [panelW])

  useEffect(() => {
    writeBool(BACKLOG_VISIBLE_KEY, showBacklog)
  }, [showBacklog])

  useEffect(() => {
    writeBool(PANEL_VISIBLE_KEY, showPanel)
  }, [showPanel])

  const resizeBacklog = useCallback(
    (deltaX: number) => {
      setBacklogW((prev) => {
        const body = bodyRef.current
        const side = (showPanel ? panelW + 4 : 0) + 4
        const max = body ? body.clientWidth - MIN_TIMELINE_W - side : prev + deltaX
        return Math.min(Math.max(MIN_BACKLOG_W, prev + deltaX), Math.max(MIN_BACKLOG_W, max))
      })
    },
    [showPanel, panelW],
  )

  const resizePanel = useCallback(
    (deltaX: number) => {
      setPanelW((prev) => {
        const body = bodyRef.current
        const side = (showBacklog ? backlogW + 4 : 0) + 4
        const max = body ? body.clientWidth - MIN_TIMELINE_W - side : prev - deltaX
        return Math.min(Math.max(MIN_PANEL_W, prev - deltaX), Math.max(MIN_PANEL_W, max))
      })
    },
    [showBacklog, backlogW],
  )

  const toggleBacklog = useCallback(() => {
    setShowBacklog((v) => !v)
  }, [])

  const togglePanel = useCallback(() => {
    setShowPanel((v) => !v)
  }, [])

  return {
    bodyRef,
    backlogW,
    panelW,
    showBacklog,
    showPanel,
    setShowBacklog,
    setShowPanel,
    toggleBacklog,
    togglePanel,
    resizeBacklog,
    resizePanel,
  }
}
