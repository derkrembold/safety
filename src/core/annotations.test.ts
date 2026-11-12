import { describe, expect, it } from 'vitest'
import {
  ProjectFormatError, createEmptyProject, emptyDiagram, fromJSON, parseProject, serializeProject, toJSON,
  validateProject, setDiagram,
  type Annotation, type DiagramDocument, type Project,
} from '.'
import { buildBddFromDiagram } from './bdd'
import { sharedSensorProject } from './fixtures'

const NOTE: Annotation = { id: 'a-1', text: 'Annahme:\nSensor wird jährlich getestet', position: { x: -20, y: 340 } }

function withNote(project: Project, ...notes: Annotation[]): Project {
  const diagram = project.diagrams.fehlerbaum!
  return setDiagram(project, 'fehlerbaum', {
    ...diagram, annotations: Object.fromEntries(notes.map((note) => [note.id, note])),
  })
}

describe('Kommentare im Projektmodell', () => {
  it('stellt Text und Position beim Datei-Roundtrip vollständig wieder her', () => {
    const project = withNote(sharedSensorProject(), NOTE, { id: 'a-2', text: '', position: { x: 5, y: 6 } })
    const restored = fromJSON(toJSON(project))
    expect(restored.diagrams.fehlerbaum?.annotations).toEqual(project.diagrams.fehlerbaum?.annotations)
  })

  it('lässt Kommentare in der Datei weg, solange es keine gibt; alte Dateien bleiben importierbar', () => {
    const project = sharedSensorProject()
    const file = JSON.parse(toJSON(project))
    expect(file.diagrams.fehlerbaum).not.toHaveProperty('annotations')
    const restored = parseProject(file)
    expect(restored.diagrams.fehlerbaum?.annotations).toBeUndefined()
    expect(restored.diagrams.fehlerbaum?.nodes).toEqual(project.diagrams.fehlerbaum?.nodes)
  })

  it('lehnt einen Kommentar ab, dessen Schlüssel nicht zu seiner Kennung passt', () => {
    const file = JSON.parse(toJSON(withNote(sharedSensorProject(), NOTE)))
    file.diagrams.fehlerbaum.annotations['a-1'].id = 'a-other'
    expect(() => parseProject(file)).toThrow(ProjectFormatError)
  })

  it('lehnt einen Kommentar ohne Text oder Position ab', () => {
    const file = JSON.parse(toJSON(withNote(sharedSensorProject(), NOTE)))
    delete file.diagrams.fehlerbaum.annotations['a-1'].position
    expect(() => parseProject(file)).toThrow(ProjectFormatError)
  })

  it('serialisiert nur die bekannten Felder eines Kommentars', () => {
    const noisy = { ...NOTE, extra: 1 } as Annotation
    const saved = serializeProject(withNote(sharedSensorProject(), noisy))
    expect(saved.diagrams.fehlerbaum?.annotations?.['a-1']).toEqual(NOTE)
  })
})

describe('Kommentare haben keinen Einfluss auf Logik und BDD', () => {
  it('liefert mit und ohne Kommentar identische Validierungs- und BDD-Ergebnisse', () => {
    const plain = sharedSensorProject()
    const commented = withNote(plain, NOTE, { id: 'a-2', text: 'noch einer', position: { x: 0, y: 0 } })
    expect(validateProject(commented)).toEqual(validateProject(plain))
    const bddPlain = buildBddFromDiagram(plain.diagrams.fehlerbaum!, plain.components)
    const bddCommented = buildBddFromDiagram(commented.diagrams.fehlerbaum!, commented.components)
    expect(bddCommented).toEqual(bddPlain)
  })

  it('behandelt eine reine Kommentarseite weiterhin als leeren logischen Baum', () => {
    const empty = setDiagram(createEmptyProject('leer'), 'fehlerbaum', emptyDiagram())
    const onlyNote = withNote(empty, NOTE)
    expect(validateProject(onlyNote)).toEqual(validateProject(empty))
    const message = (project: Project) => {
      try {
        buildBddFromDiagram(project.diagrams.fehlerbaum as DiagramDocument, project.components)
      } catch (error) {
        return (error as Error).message
      }
      return undefined
    }
    expect(message(onlyNote)).toBe(message(empty))
  })
})
