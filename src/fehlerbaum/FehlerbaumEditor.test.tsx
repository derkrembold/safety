import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FehlerbaumEditor } from './FehlerbaumEditor'
import { FaultTree } from './model'

function addViaSidebar(name: string) {
  return userEvent.dblClick(screen.getByText(name))
}

const originalElementFromPoint = document.elementFromPoint

describe('FehlerbaumEditor', () => {
  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint
  })

  it('bietet die drei Verknüpfungselemente in der Seitenleiste an', () => {
    render(<FehlerbaumEditor tree={new FaultTree()} />)
    const sidebar = screen.getByRole('complementary', { name: 'Verknüpfungselemente' })
    for (const name of ['Standardeingang', 'ODER-Verknüpfung', 'UND-Verknüpfung']) {
      expect(within(sidebar).getByText(name)).toBeInTheDocument()
    }
  })

  it('fügt per Doppelklick Elemente ins Feld ein und zeigt ihre Namen', async () => {
    const tree = new FaultTree()
    render(<FehlerbaumEditor tree={tree} />)
    await addViaSidebar('Standardeingang')
    await addViaSidebar('UND-Verknüpfung')
    expect(tree.all().map((element) => element.kind)).toEqual(['standardeingang', 'und'])
    expect(screen.getByText('Eingang 1')).toBeInTheDocument()
    expect(screen.getByText('UND 1')).toBeInTheDocument()
  })

  it('zeigt einen Hinweis, solange das Feld leer ist', async () => {
    render(<FehlerbaumEditor tree={new FaultTree()} />)
    expect(screen.getByText(/in dieses Feld ziehen/)).toBeInTheDocument()
    await addViaSidebar('Standardeingang')
    expect(screen.queryByText(/in dieses Feld ziehen/)).not.toBeInTheDocument()
  })

  it('stellt Verbindungen des Baums als Linien dar', () => {
    const tree = new FaultTree()
    const oder = tree.create('oder', { x: 100, y: 20 })
    const eingang = tree.create('standardeingang', { x: 100, y: 200 })
    tree.connect(eingang.id, oder.id)
    const { container } = render(<FehlerbaumEditor tree={tree} />)
    expect(container.querySelectorAll('path.ft-connection')).toHaveLength(1)
  })

  it('verbindet per Mausziehen von einem Ausgang zu einem Eingang', () => {
    const tree = new FaultTree()
    const oder = tree.create('oder', { x: 100, y: 20 })
    const eingang = tree.create('standardeingang', { x: 100, y: 200 })
    const { container } = render(<FehlerbaumEditor tree={tree} />)
    const out = container.querySelector(`[data-stub="out"][data-element-id="${eingang.id}"]`)!
    const input = container.querySelector(`[data-stub="in"][data-element-id="${oder.id}"]`)!
    // jsdom hat kein Layout: elementFromPoint liefert den Ziel-Stub.
    document.elementFromPoint = () => input
    fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
    expect(oder.nodes).toEqual([eingang])
  })

  it('meldet eine abgelehnte Verbindung statt sie anzulegen', () => {
    const tree = new FaultTree()
    const oder = tree.create('oder', { x: 100, y: 20 })
    const und = tree.create('und', { x: 100, y: 200 })
    tree.connect(und.id, oder.id)
    const { container } = render(<FehlerbaumEditor tree={tree} />)
    const out = container.querySelector(`[data-stub="out"][data-element-id="${oder.id}"]`)!
    const input = container.querySelector(`[data-stub="in"][data-element-id="${und.id}"]`)!
    document.elementFromPoint = () => input
    fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
    expect(screen.getByRole('status')).toHaveTextContent('Zyklus')
    expect(und.nodes).toEqual([])
  })

  it('löscht das gewählte Element mit Entf samt seinen Verbindungen', async () => {
    const tree = new FaultTree()
    const oder = tree.create('oder', { x: 100, y: 20 })
    const eingang = tree.create('standardeingang', { x: 100, y: 200 })
    tree.connect(eingang.id, oder.id)
    render(<FehlerbaumEditor tree={tree} />)
    await userEvent.click(screen.getByText('Eingang 1'))
    fireEvent.pointerDown(screen.getByText('Eingang 1').closest('g')!, { button: 0 })
    await userEvent.keyboard('{Delete}')
    expect(tree.get(eingang.id)).toBeUndefined()
    expect(oder.nodes).toEqual([])
  })

  it('benennt ein Element per Doppelklick um', async () => {
    const tree = new FaultTree()
    tree.create('standardeingang', { x: 50, y: 50 })
    render(<FehlerbaumEditor tree={tree} />)
    await userEvent.dblClick(screen.getByText('Eingang 1').closest('g')!)
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'Sensor A{Enter}')
    expect(screen.getByText('Sensor A')).toBeInTheDocument()
    expect(tree.all()[0].label).toBe('Sensor A')
  })

  describe('Abbrechen beim Verbinden', () => {
    function setup() {
      const tree = new FaultTree()
      const oder = tree.create('oder', { x: 100, y: 20 })
      const eingang = tree.create('standardeingang', { x: 100, y: 200 })
      const { container, unmount } = render(<FehlerbaumEditor tree={tree} />)
      const out = container.querySelector(`[data-stub="out"][data-element-id="${eingang.id}"]`)!
      const input = container.querySelector(`[data-stub="in"][data-element-id="${oder.id}"]`)!
      document.elementFromPoint = () => input
      fireEvent.pointerDown(out, { button: 0, clientX: 10, clientY: 10 })
      expect(container.querySelector('path.ft-connection.pending')).not.toBeNull()
      return { tree, oder, container, unmount }
    }

    it('legt nach Escape beim Loslassen keine Verbindung an', async () => {
      const { oder, container } = setup()
      await userEvent.keyboard('{Escape}')
      expect(container.querySelector('path.ft-connection.pending')).toBeNull()
      fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
      expect(oder.nodes).toEqual([])
    })

    it('zeigt nach Escape bei weiterer Mausbewegung keine Vorschau mehr', async () => {
      const { container } = setup()
      await userEvent.keyboard('{Escape}')
      fireEvent.pointerMove(window, { clientX: 30, clientY: 30 })
      expect(container.querySelector('path.ft-connection.pending')).toBeNull()
    })

    it('behandelt pointercancel nicht wie ein erfolgreiches Loslassen', () => {
      const { oder, container } = setup()
      fireEvent.pointerCancel(window)
      expect(container.querySelector('path.ft-connection.pending')).toBeNull()
      expect(oder.nodes).toEqual([])
      fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
      expect(oder.nodes).toEqual([])
    })

    it('beendet das Verfolgen beim Entfernen des Editors', () => {
      const { oder, unmount } = setup()
      unmount()
      fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
      expect(oder.nodes).toEqual([])
    })
  })

  describe('Begrenzung der Zeichenfläche', () => {
    function mockCanvasSize(width: number, height: number) {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
    }
    afterEach(() => vi.restoreAllMocks())

    it('hält ein über den rechten und unteren Rand gezogenes Element sichtbar', () => {
      mockCanvasSize(200, 200)
      const tree = new FaultTree()
      const oder = tree.create('oder', { x: 10, y: 10 })
      render(<FehlerbaumEditor tree={tree} />)
      fireEvent.pointerDown(screen.getByText('ODER 1').closest('g')!, {
        button: 0,
        clientX: 50,
        clientY: 50,
      })
      fireEvent.pointerMove(window, { clientX: 900, clientY: 900 })
      fireEvent.pointerUp(window, { clientX: 900, clientY: 900 })
      expect(tree.layout.get(oder.id)).toEqual({ x: 200 - 72, y: 200 - 64 })
    })

    it('hält ein über den linken und oberen Rand gezogenes Element sichtbar', () => {
      mockCanvasSize(200, 200)
      const tree = new FaultTree()
      const oder = tree.create('oder', { x: 60, y: 60 })
      render(<FehlerbaumEditor tree={tree} />)
      fireEvent.pointerDown(screen.getByText('ODER 1').closest('g')!, {
        button: 0,
        clientX: 100,
        clientY: 100,
      })
      fireEvent.pointerMove(window, { clientX: -500, clientY: -500 })
      fireEvent.pointerUp(window, { clientX: -500, clientY: -500 })
      expect(tree.layout.get(oder.id)).toEqual({ x: 0, y: 0 })
    })

    it('setzt per Doppelklick eingefügte Elemente innerhalb der Fläche ab', async () => {
      mockCanvasSize(100, 100)
      const tree = new FaultTree()
      render(<FehlerbaumEditor tree={tree} />)
      await userEvent.dblClick(screen.getByText('UND-Verknüpfung'))
      const position = tree.layout.get(tree.all()[0].id)!
      expect(position.x).toBeLessThanOrEqual(100 - 72)
      expect(position.y).toBeLessThanOrEqual(100 - 64)
    })
  })
})
