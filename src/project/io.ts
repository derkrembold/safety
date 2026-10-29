import { parseProject, serializeProject } from '../core'
import type { Project } from './types'

export function exportProjectToFile(project: Project): void {
  const blob = new Blob([JSON.stringify(serializeProject(project), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.name || 'projekt'}.safety.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function importProjectFromFile(file: File): Promise<Project> {
  return file.text().then((text) => {
    try {
      return parseProject(JSON.parse(text))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Datei ist keine gültige Projektdatei. ${detail}`)
    }
  })
}
