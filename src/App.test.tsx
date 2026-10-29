import { render, screen } from '@testing-library/react'
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
