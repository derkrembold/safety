import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'
import type { Command } from './commands'

function commands(): { list: Command[]; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn()
  return {
    run,
    list: [
      { id: 'a', label: 'Projekt exportieren', run: () => run('a') },
      { id: 'b', label: 'Projekt importieren', run: () => run('b') },
      { id: 'c', label: 'Debug-Modus einschalten', run: () => run('c') },
    ],
  }
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    const { list } = commands()
    render(<CommandPalette open={false} commands={list} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists every command and focuses the search field when opened', () => {
    const { list } = commands()
    render(<CommandPalette open commands={list} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Befehle' })).toBeInTheDocument()
    for (const command of list) {
      expect(screen.getByRole('option', { name: command.label })).toBeInTheDocument()
    }
  })

  it('filters commands by the search text', async () => {
    const { list } = commands()
    const user = userEvent.setup()
    render(<CommandPalette open commands={list} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Befehl suchen' }), 'debug')
    expect(screen.getByRole('option', { name: 'Debug-Modus einschalten' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Projekt exportieren' })).not.toBeInTheDocument()
  })

  it('shows a message instead of an empty list when nothing matches', async () => {
    const { list } = commands()
    const user = userEvent.setup()
    render(<CommandPalette open commands={list} onClose={vi.fn()} />)
    await user.type(screen.getByRole('textbox', { name: 'Befehl suchen' }), 'xyz-nonexistent')
    expect(screen.getByText('Kein passender Befehl.')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('runs the first command and closes on Enter', async () => {
    const { list, run } = commands()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CommandPalette open commands={list} onClose={onClose} />)
    await user.keyboard('{Enter}')
    expect(run).toHaveBeenCalledWith('a')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves the highlight with arrow keys before running on Enter', async () => {
    const { list, run } = commands()
    const user = userEvent.setup()
    render(<CommandPalette open commands={list} onClose={vi.fn()} />)
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(run).toHaveBeenCalledWith('c')
  })

  it('runs a clicked command directly, regardless of the highlight', async () => {
    const { list, run } = commands()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<CommandPalette open commands={list} onClose={onClose} />)
    await user.click(screen.getByRole('option', { name: 'Debug-Modus einschalten' }))
    expect(run).toHaveBeenCalledWith('c')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes without running anything on Escape or an outside click', async () => {
    const { list, run } = commands()
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<CommandPalette open commands={list} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()

    onClose.mockClear()
    rerender(<CommandPalette open commands={list} onClose={onClose} />)
    await user.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
  })
})
