interface Shortcut {
  keys: string
  description: string
}

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: 'Strg/Cmd + K', description: 'Befehle öffnen' },
  { keys: '?', description: 'Diese Übersicht öffnen' },
  { keys: 'Esc', description: 'Dialog schließen' },
]

const FEHLERBAUM_SHORTCUTS: Shortcut[] = [
  { keys: 'Ziehen', description: 'Element verschieben' },
  { keys: 'Stub ziehen', description: 'Verbinden' },
  { keys: 'Doppelklick', description: 'Umbenennen' },
  { keys: 'Entf', description: 'Löschen' },
  { keys: 'Esc', description: 'Auswahl aufheben' },
]

interface Props {
  open: boolean
  onClose: () => void
}

/** Always-reachable reference for every keyboard shortcut in the app (issue #20). */
export function ShortcutsOverview({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div className="shell-overlay" onClick={onClose}>
      <div
        className="shell-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Tastenkürzel"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <h2>Tastenkürzel</h2>

        <h3>Allgemein</h3>
        <dl className="shell-shortcut-list">
          {GLOBAL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="shell-shortcut-row">
              <dt><kbd>{shortcut.keys}</kbd></dt>
              <dd>{shortcut.description}</dd>
            </div>
          ))}
        </dl>

        <h3>Fehlerbaum-Editor</h3>
        <dl className="shell-shortcut-list">
          {FEHLERBAUM_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="shell-shortcut-row">
              <dt><kbd>{shortcut.keys}</kbd></dt>
              <dd>{shortcut.description}</dd>
            </div>
          ))}
        </dl>

        <button type="button" className="shell-close" onClick={onClose} autoFocus>
          Schließen
        </button>
      </div>
    </div>
  )
}
