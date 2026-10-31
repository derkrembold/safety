import { useCallback, useMemo, useRef, useState } from 'react'
import './App.css'
import { FaultTree } from './fehlerbaum/model'
import { exportProjectToFile, importProjectFromFile } from './project/io'
import { createEmptyProject, type Project, type TabId } from './project/types'
import { BddTab } from './tabs/Bdd'
import { FehlerbaumanalyseTab } from './tabs/Fehlerbaumanalyse'
import { ZuverlaessigkeitsdiagrammTab } from './tabs/Zuverlaessigkeitsdiagramm'
import { appLogger } from './debug/appLogger'
import { DebugControls } from './debug/DebugControls'

const TABS: { id: TabId; label: string }[] = [
  { id: 'fehlerbaum', label: 'Fehlerbaumanalyse' },
  { id: 'zuverlaessigkeitsdiagramm', label: 'Zuverlässigkeitsdiagramm' },
  { id: 'bdd', label: 'Binary Decision Diagram' },
]

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('fehlerbaum')
  const [project, setProject] = useState<Project>(() =>
    createEmptyProject('Neues Projekt'),
  )
  const faultTree = useMemo(() => FaultTree.fromProject(project), [project])
  const [importRevision, setImportRevision] = useState(0)
  const handleTreeChange = useCallback((tree: FaultTree) => {
    setProject((current) => tree.toProject(current))
  }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    appLogger.runAction('project-imported', async () => {
      const loaded = await importProjectFromFile(file)
      // Validate the editor projection before replacing any visible state.
      FaultTree.fromProject(loaded)
      return loaded
    })
      .then((loaded) => {
        setProject(loaded)
        setImportRevision((revision) => revision + 1)
      })
      .catch((error: Error) => {
        alert(`Projekt konnte nicht geladen werden: ${error.message}`)
      })
  }

  return (
    <div id="app">
      <header id="app-header">
        <div id="app-toolbar">
          <span id="app-title">Safety</span>
          <div id="project-actions">
            <button type="button" onClick={() => appLogger.runAction('project-exported', () => exportProjectToFile(project))}>
              Projekt exportieren
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Projekt importieren
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              hidden
            />
          </div>
        </div>
        <nav id="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'tab active' : 'tab'}
              onClick={() => {
                if (tab.id !== activeTab) {
                  appLogger.logAction(`tab-selected:${tab.id}`)
                  setActiveTab(tab.id)
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <DebugControls logger={appLogger} getProjectState={() => project} />

      <main id="tab-content">
        {activeTab === 'fehlerbaum' && (
          <FehlerbaumanalyseTab key={importRevision} tree={faultTree} onChange={handleTreeChange} />
        )}
        {activeTab === 'zuverlaessigkeitsdiagramm' && (
          <ZuverlaessigkeitsdiagrammTab />
        )}
        {activeTab === 'bdd' && <BddTab />}
      </main>
    </div>
  )
}

export default App
