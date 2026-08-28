import { useRef, useState } from 'react'
import { downloadMermaidGantt } from './mermaidExport'
import { downloadProjectYaml, parseProjectYaml } from './projectYaml'
import { usePlan } from './store'

export function ProjectIO() {
  const { state, schedule, importProject, clearProject, reset } = usePlan()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  function onExportYaml() {
    setError('')
    downloadProjectYaml(state)
  }

  function onExportMermaid() {
    setError('')
    downloadMermaidGantt(state, schedule)
  }

  function onImportClick() {
    setError('')
    fileRef.current?.click()
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      const text = await file.text()
      const project = parseProjectYaml(text)
      if (
        !window.confirm(
          'Заменить текущий проект содержимым файла? Несохранённые изменения будут потеряны.',
        )
      ) {
        return
      }
      importProject(project)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onClear() {
    setError('')
    if (
      !window.confirm(
        'Очистить проект полностью? Команда, задачи и план будут удалены.',
      )
    ) {
      return
    }
    clearProject()
  }

  return (
    <div className="project-io">
      <input
        ref={fileRef}
        type="file"
        accept=".yaml,.yml,text/yaml,application/x-yaml"
        hidden
        onChange={(event) => void onFileChange(event.target.files?.[0])}
      />
      <button type="button" onClick={onExportYaml}>
        Экспорт YAML
      </button>
      <button type="button" onClick={onExportMermaid}>
        Экспорт Mermaid
      </button>
      <button type="button" onClick={onImportClick}>
        Импорт YAML
      </button>
      <button type="button" onClick={onClear}>
        Очистить
      </button>
      <button type="button" onClick={reset}>
        Демо
      </button>
      {error && <p className="project-io-error">{error}</p>}
    </div>
  )
}
