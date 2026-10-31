import { useEffect, useMemo, useRef, useState } from 'react'
import type { Command } from './commands'

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
  const inputRef = useRef<HTMLInputElement>(null)

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
  const clampedHighlighted = filtered.length === 0 ? 0 : Math.min(highlighted, filtered.length - 1)

  // Focusing the DOM input is a real external-system effect, unlike the state resets
  // above, so it stays in an effect.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  function run(command: Command | undefined) {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div className="shell-overlay" onClick={onClose}>
      <div
        className="shell-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Befehle"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onClose()
          } else if (event.key === 'ArrowDown') {
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
          ref={inputRef}
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
    </div>
  )
}
