import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  label: string
  onClose: () => void
  className?: string
  children: React.ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A real modal: isolates the background from the keyboard while open, instead of only
 * stopping clicks on an overlay.
 *
 * The native `<dialog>` element's `showModal()` would give this for free in a real
 * browser (the rest of the page becomes `inert`), but jsdom — this project's test
 * environment — does not implement `showModal`/`close`/`inert` at all, so relying on it
 * would make the isolation untestable. Instead, every keydown inside the dialog stops
 * propagating past it: a background `window` keydown listener (e.g. the Fehlerbaum
 * editor's Delete/Backspace handling) can then never see a keystroke meant for the
 * dialog, even while a node stays selected behind it (Codex review, PR #29). Tab/Shift+Tab
 * are trapped among the dialog's own focusable elements, and focus returns to whatever
 * had it before the dialog opened once it closes.
 */
export function Modal({ open, label, onClose, className, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus()
      previouslyFocused.current = null
    }
  }, [open])

  if (!open) return null

  function trapTab(event: React.KeyboardEvent) {
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const atEdge = event.shiftKey ? document.activeElement === first : document.activeElement === last
    // Also wraps when focus is outside the trap entirely, e.g. nothing has been
    // focused yet after opening.
    const outside = !dialogRef.current?.contains(document.activeElement)
    if (atEdge || outside) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    }
  }

  return (
    <div className="shell-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={className}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // Isolate the dialog first (see doc comment above), then handle its own keys.
          event.stopPropagation()
          if (event.key === 'Escape') onClose()
          else if (event.key === 'Tab') trapTab(event)
        }}
      >
        {children}
      </div>
    </div>
  )
}
