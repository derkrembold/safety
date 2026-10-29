import { useRef, useState } from 'react'
import './App.css'
import { FaultTree } from './fehlerbaum/model'
import { exportProjectToFile, importProjectFromFile } from './project/io'
import { createEmptyProject, type Project, type TabId } from './project/types'
import { BddTab } from './tabs/Bdd'
import { FehlerbaumanalyseTab } from './tabs/Fehlerbaumanalyse'
import { ZuverlaessigkeitsdiagrammTab } from './tabs/Zuverlaessigkeitsdiagramm'

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
  // Außerhalb des Reiters gehalten, damit der Fehlerbaum beim Reiterwechsel erhalten bleibt.
  const [faultTree] = useState(() => new FaultTree())
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    importProjectFromFile(file)
      .then(setProject)
      .catch((error: Error) => {
        alert(`Projekt konnte nicht geladen werden: ${error.message}`)
      })
  }

  return (
    <div id="app">
      <header id="app-header">
        <nav id="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? 'tab active' : 'tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div id="project-actions">
          <button type="button" onClick={() => exportProjectToFile(project)}>
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
      </header>

      <main id="tab-content">
        {activeTab === 'fehlerbaum' && <FehlerbaumanalyseTab tree={faultTree} />}
        {activeTab === 'zuverlaessigkeitsdiagramm' && (
          <ZuverlaessigkeitsdiagrammTab />
        )}
        {activeTab === 'bdd' && <BddTab />}
      </main>
    </div>
  )
}

export default App
