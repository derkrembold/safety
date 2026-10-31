import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './App.css'
import './shell/shell.css'
import { FaultTree } from './fehlerbaum/model'
import { exportProjectToFile, importProjectFromFile } from './project/io'
import { createEmptyProject, type Project, type TabId } from './project/types'
import { BddTab } from './tabs/Bdd'
import { FehlerbaumanalyseTab } from './tabs/Fehlerbaumanalyse'
import { ZuverlaessigkeitsdiagrammTab } from './tabs/Zuverlaessigkeitsdiagramm'
import { appLogger } from './debug/appLogger'
import { DebugControls } from './debug/DebugControls'
import { CommandPalette } from './shell/CommandPalette'
import { ShortcutsOverview } from './shell/ShortcutsOverview'
import type { Command } from './shell/commands'

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
  const debugEnabled = useSyncExternalStore(appLogger.subscribe, () => appLogger.debugEnabled)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Global shortcuts: Ctrl/Cmd+K opens the command palette, "?" opens the shortcuts
  // overview. Both also have a visible toolbar button (issue #20) — a browser may bind
  // either key itself (e.g. Ctrl+K to the address bar), so preventDefault reclaims it
  // while the page has focus, but the buttons stay the reliable way in.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      if (event.key === '?' && !typing) {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commands: Command[] = useMemo(
    () => [
      ...TABS.filter((tab) => tab.id !== activeTab).map((tab) => ({
        id: `tab-${tab.id}`,
        label: `Zu „${tab.label}“ wechseln`,
        run: () => {
          appLogger.logAction(`tab-selected:${tab.id}`)
          setActiveTab(tab.id)
        },
      })),
      {
        id: 'project-export',
        label: 'Projekt exportieren',
        run: () => appLogger.runAction('project-exported', () => exportProjectToFile(project)),
      },
      {
        id: 'project-import',
        label: 'Projekt importieren',
        run: () => fileInputRef.current?.click(),
      },
      {
        id: 'debug-toggle',
        label: debugEnabled ? 'Debug-Modus ausschalten' : 'Debug-Modus einschalten',
        run: () => appLogger.setDebugEnabled(!debugEnabled),
      },
      {
        id: 'shortcuts',
        label: 'Tastenkürzel anzeigen',
        run: () => setShortcutsOpen(true),
      },
    ],
    [activeTab, project, debugEnabled],
  )

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
            <button type="button" onClick={() => setPaletteOpen(true)} title="Strg/Cmd + K">
              Befehle
            </button>
            <button type="button" onClick={() => setShortcutsOpen(true)} title="?">
              Tastenkürzel
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

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      <ShortcutsOverview open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}

export default App
