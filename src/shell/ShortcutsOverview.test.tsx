import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutsOverview } from './ShortcutsOverview'

describe('ShortcutsOverview', () => {
  it('renders nothing while closed', () => {
    render(<ShortcutsOverview open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists global and Fehlerbaum-editor shortcuts when open', () => {
    render(<ShortcutsOverview open onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Tastenkürzel' })).toBeInTheDocument()
    expect(screen.getByText('Strg/Cmd + K')).toBeInTheDocument()
    expect(screen.getByText('Befehle öffnen')).toBeInTheDocument()
    expect(screen.getByText('Entf')).toBeInTheDocument()
    expect(screen.getByText('Löschen')).toBeInTheDocument()
  })

  it('closes on the close button, Escape, or an outside click', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ShortcutsOverview open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onClose).toHaveBeenCalledOnce()

    onClose.mockClear()
    rerender(<ShortcutsOverview open onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()

    onClose.mockClear()
    rerender(<ShortcutsOverview open onClose={onClose} />)
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
