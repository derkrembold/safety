import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App tab navigation', () => {
  it('shows the Fehlerbaumanalyse tab by default', () => {
    render(<App />)
    expect(
      screen.getByRole('complementary', { name: 'Verknüpfungselemente' }),
    ).toBeInTheDocument()
  })

  it('keeps the fault tree when switching tabs', async () => {
    render(<App />)
    await userEvent.dblClick(screen.getByText('Standardeingang'))
    expect(screen.getByText('Eingang 1')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Binary Decision Diagram' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Fehlerbaumanalyse' }),
    )
    expect(screen.getByText('Eingang 1')).toBeInTheDocument()
  })

  it('switches to the Zuverlässigkeitsdiagramm tab on click', async () => {
    render(<App />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Zuverlässigkeitsdiagramm' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Zuverlässigkeitsdiagramm' }),
    ).toBeInTheDocument()
  })

  it('switches to the BDD tab on click', async () => {
    render(<App />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Binary Decision Diagram' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Binary Decision Diagram' }),
    ).toBeInTheDocument()
  })
})

describe('App keyboard shell (issue #20)', () => {
  it('opens the command palette with Ctrl+K and runs a tab-switch command from it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog', { name: 'Befehle' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Zu „Binary Decision Diagram“ wechseln' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Binary Decision Diagram' })).toBeInTheDocument()
  })

  it('also opens the command palette from the visible "Befehle" button', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Befehle' }))
    expect(screen.getByRole('dialog', { name: 'Befehle' })).toBeInTheDocument()
  })

  it('opens the shortcuts overview with "?", but not while typing in a text field', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Tastenkürzel' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'Befehle' }))
    await user.type(screen.getByRole('textbox', { name: 'Befehl suchen' }), '?')
    expect(screen.queryByRole('dialog', { name: 'Tastenkürzel' })).not.toBeInTheDocument()
  })

  it('also opens the shortcuts overview from the visible "Tastenkürzel" button', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Tastenkürzel' }))
    expect(screen.getByRole('dialog', { name: 'Tastenkürzel' })).toBeInTheDocument()
  })

  it('keeps a dialog\'s Delete key from reaching the Fehlerbaum editor behind it (Codex review, PR #29)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.dblClick(screen.getByText('Standardeingang'))
    expect(screen.getByText('Eingang 1')).toBeInTheDocument()

    // The new element is selected; opening a dialog on top of it and pressing Delete
    // must not let it fall through to the editor's own window-level handler.
    await user.click(screen.getByRole('button', { name: 'Tastenkürzel' }))
    expect(screen.getByRole('dialog', { name: 'Tastenkürzel' })).toBeInTheDocument()
    await user.keyboard('{Delete}')
    expect(screen.getByText('Eingang 1')).toBeInTheDocument()

    // Once the dialog is gone, the same selection and shortcut work as normal.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByText('Eingang 1').closest('g')!, { button: 0 })
    await user.keyboard('{Delete}')
    expect(screen.queryByText('Eingang 1')).not.toBeInTheDocument()
  })

  it('traps Tab within an open dialog instead of letting it reach the background toolbar (Codex review, PR #29)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Tastenkürzel' }))
    const closeButton = screen.getByRole('button', { name: 'Schließen' })
    expect(document.activeElement).toBe(closeButton)
    await user.keyboard('{Tab}')
    // "Schließen" is the dialog's only focusable element, so Tab must wrap back to it,
    // never reach a background control like "Projekt exportieren".
    expect(document.activeElement).toBe(closeButton)
  })
})
