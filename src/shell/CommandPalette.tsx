import { useMemo, useState } from 'react'
import type { Command } from './commands'
import { Modal } from './Modal'

interface Props {
  open: boolean
  commands: Command[]
  onClose: () => void
}

/** A Ctrl/Cmd+K style launcher: type to filter, arrows to move, Enter to run. */
export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return commands
    return commands.filter((command) => command.label.toLowerCase().includes(needle))
  }, [commands, query])

  // Reset the dialog's own state as it opens, by adjusting state during render instead
  // of in an effect — React's recommended way to react to a prop change with no other
  // external system involved, since it avoids rendering once with stale state first.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setHighlighted(0)
    }
  }
  // Clamped on both ends: an empty result list can otherwise leave `highlighted` at -1
  // (ArrowDown has nothing to clamp against), which would then survive a search that
  // becomes non-empty again and point Enter at a non-existent command (Codex review,
  // PR #29).
  const clampedHighlighted =
    filtered.length === 0 ? 0 : Math.max(0, Math.min(highlighted, filtered.length - 1))

  function run(command: Command | undefined) {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <Modal open={open} label="Befehle" onClose={onClose} className="shell-dialog">
      <div
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlighted(Math.min(clampedHighlighted + 1, filtered.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlighted(Math.max(clampedHighlighted - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            run(filtered[clampedHighlighted])
          }
        }}
      >
        <input
          type="text"
          placeholder="Befehl suchen…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Befehl suchen"
        />
        <ul role="listbox" aria-label="Befehle">
          {filtered.length === 0 && <li className="shell-empty">Kein passender Befehl.</li>}
          {filtered.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === clampedHighlighted}
                className={index === clampedHighlighted ? 'shell-item active' : 'shell-item'}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => run(command)}
              >
                {command.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
