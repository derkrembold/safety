import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FehlerbaumEditor } from './FehlerbaumEditor'
import { FaultTree } from './model'
import { CANVAS_PADDING } from './geometry'
import { DRAG_MIME } from './Sidebar'
import { createEmptyProject, fromJSON, toJSON } from '../core'

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

  describe('Wachsende Zeichenfläche', () => {
    function mockCanvasSize(width: number, height: number) {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
    }
    afterEach(() => vi.restoreAllMocks())

    it('erweitert die Fläche statt ein Element am Viewportrand zu begrenzen', () => {
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
      expect(tree.layout.get(oder.id)).toEqual({ x: 860, y: 860 })
      const surface = screen.getByRole('region', { name: 'Fehlerbaum-Zeichenfläche' }).querySelector('.ft-surface') as HTMLElement
      expect(parseFloat(surface.style.width)).toBeGreaterThan(860 + 72)
      expect(parseFloat(surface.style.height)).toBeGreaterThan(860 + 64)
    })

    it('erweitert die Fläche auch über den linken und oberen Rand hinaus und gleicht den Scrollversatz aus', () => {
      mockCanvasSize(200, 200)
      const tree = new FaultTree()
      const oder = tree.create('oder', { x: 60, y: 60 })
      tree.create('standardeingang', { x: 300, y: 300 })
      render(<FehlerbaumEditor tree={tree} />)
      const region = screen.getByRole('region', { name: 'Fehlerbaum-Zeichenfläche' })
      fireEvent.pointerDown(screen.getByText('ODER 1').closest('g')!, {
        button: 0,
        clientX: 100,
        clientY: 100,
      })
      fireEvent.pointerMove(window, { clientX: -700, clientY: -700 })
      fireEvent.pointerUp(window, { clientX: -700, clientY: -700 })
      // Delta ist -800 je Achse (Start 100 → -700); 60 - 800 = -740, keine Begrenzung bei 0.
      expect(tree.layout.get(oder.id)).toEqual({ x: -740, y: -740 })
      // Der Viewport bleibt visuell stabil: die Scrollposition gleicht den neuen Ursprung aus.
      expect(region.scrollLeft).toBe(740)
      expect(region.scrollTop).toBe(740)
      const surface = region.querySelector('.ft-surface') as HTMLElement
      expect(parseFloat(surface.style.width)).toBeGreaterThan(1000)
      expect(parseFloat(surface.style.height)).toBeGreaterThan(1000)
      const restored = FaultTree.fromProject(fromJSON(toJSON(tree.toProject(createEmptyProject('Negativtest')))))
      expect(restored.layout.get(oder.id)).toEqual({ x: -740, y: -740 })
    })

    it('springt beim Weiterziehen nach einer Ursprungsverschiebung nicht zurück (Codex-Regression PR #35)', () => {
      mockCanvasSize(200, 200)
      const tree = new FaultTree()
      const oder = tree.create('oder', { x: 60, y: 60 })
      tree.create('standardeingang', { x: 300, y: 300 })
      render(<FehlerbaumEditor tree={tree} />)
      const region = screen.getByRole('region', { name: 'Fehlerbaum-Zeichenfläche' })
      const surface = region.querySelector('.ft-surface') as HTMLElement
      // Das Surface-Rechteck hängt im Browser vom aktuellen Scrollversatz ab.
      vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => ({
        left: -region.scrollLeft, top: -region.scrollTop,
        x: -region.scrollLeft, y: -region.scrollTop,
        width: 1000, height: 1000,
        right: 1000 - region.scrollLeft, bottom: 1000 - region.scrollTop,
        toJSON: () => ({}),
      }))
      fireEvent.pointerDown(screen.getByText('ODER 1').closest('g')!, { button: 0, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
      expect(tree.layout.get(oder.id)).toEqual({ x: -40, y: -40 })
      expect(region.scrollLeft).toBe(40)
      // Gleiche Zeigerposition wie eben, aber nach der Ursprungsverschiebung: darf nicht zurückspringen.
      fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
      expect(tree.layout.get(oder.id)).toEqual({ x: -40, y: -40 })
      fireEvent.pointerUp(window, { clientX: 0, clientY: 0 })
      expect(tree.layout.get(oder.id)).toEqual({ x: -40, y: -40 })
    })

    it('erweitert auch eine kleine Fläche für per Doppelklick eingefügte Elemente', async () => {
      mockCanvasSize(100, 100)
      const tree = new FaultTree()
      render(<FehlerbaumEditor tree={tree} />)
      await userEvent.dblClick(screen.getByText('UND-Verknüpfung'))
      const position = tree.layout.get(tree.all()[0].id)!
      expect(position).toEqual({ x: 40, y: 40 })
    })
  })
  describe('Bedienung nach dem Scrollen', () => {
    function setup(tree: FaultTree) {
      const rendered = render(<FehlerbaumEditor tree={tree} />)
      const viewport = screen.getByRole('region', { name: 'Fehlerbaum-Zeichenfläche' })
      const surface = viewport.querySelector('.ft-surface') as HTMLElement
      viewport.scrollLeft = 300
      viewport.scrollTop = 200
      vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => ({
        left: 101 - viewport.scrollLeft, top: 51 - viewport.scrollTop,
        x: 101 - viewport.scrollLeft, y: 51 - viewport.scrollTop,
        width: 1600, height: 1200, right: 1701 - viewport.scrollLeft,
        bottom: 1251 - viewport.scrollTop, toJSON: () => ({}),
      }))
      return { ...rendered, viewport, surface }
    }

    it('platziert einen Drop in Modellkoordinaten und erweitert den Canvas', () => {
      const tree = new FaultTree()
      const { viewport } = setup(tree)
      const drop = createEvent.drop(viewport)
      Object.defineProperties(drop, {
        clientX: { value: 225 }, clientY: { value: 175 },
        dataTransfer: { value: { getData: (type: string) => type === DRAG_MIME ? 'oder' : '' } },
      })
      fireEvent(viewport, drop)
      expect(tree.layout.get(tree.all()[0].id)).toEqual({ x: 364, y: 268 })
    })

    it('berücksichtigt Scrollen während des Verschiebens ohne Koordinatensprung', () => {
      const tree = new FaultTree()
      const node = tree.create('oder', { x: 500, y: 500 })
      const { viewport, container } = setup(tree)
      fireEvent.pointerDown(container.querySelector('.ft-element')!, { button: 0, clientX: 200, clientY: 150 })
      viewport.scrollLeft = 450
      viewport.scrollTop = 250
      fireEvent.scroll(viewport)
      expect(tree.layout.get(node.id)).toEqual({ x: 650, y: 550 })
      fireEvent.pointerMove(window, { clientX: 220, clientY: 170 })
      fireEvent.pointerUp(window, { clientX: 220, clientY: 170 })
      expect(tree.layout.get(node.id)).toEqual({ x: 670, y: 570 })
      const restored = FaultTree.fromProject(fromJSON(toJSON(tree.toProject(createEmptyProject('Scrolltest')))))
      expect(restored.layout.get(node.id)).toEqual({ x: 670, y: 570 })
    })

    it('führt Vorschau und Verbindung nach Scrollen an die richtigen Stubs', () => {
      const tree = new FaultTree()
      const gate = tree.create('oder', { x: 500, y: 350 })
      const node = tree.create('standardeingang', { x: 500, y: 500 })
      const { viewport, container } = setup(tree)
      const out = container.querySelector(`[data-stub="out"][data-element-id="${node.id}"]`)!
      const input = container.querySelector(`[data-stub="in"][data-element-id="${gate.id}"]`)!
      fireEvent.pointerDown(out, { button: 0, clientX: 200, clientY: 150 })
      fireEvent.pointerMove(window, { clientX: 225, clientY: 175 })
      expect(container.querySelector('.pending')).toHaveAttribute('d', 'M 528 500 C 528 400, 400 400, 400 300')
      viewport.scrollLeft += 20
      viewport.scrollTop += 30
      fireEvent.scroll(viewport)
      expect(container.querySelector('.pending')).toHaveAttribute('d', 'M 528 500 C 528 415, 420 415, 420 330')
      document.elementFromPoint = () => input
      fireEvent.pointerUp(window, { clientX: 225, clientY: 175 })
      expect(gate.nodes).toEqual([node])
    })

    it('hält die Umbenennung beim Modell und nicht an Viewportkoordinaten', () => {
      const tree = new FaultTree()
      tree.create('standardeingang', { x: 500, y: 500 })
      const { container, surface } = setup(tree)
      fireEvent.doubleClick(container.querySelector('.ft-element')!)
      const input = screen.getByRole('textbox')
      expect(input.parentElement).toBe(surface)
      expect(input).toHaveStyle({ left: `${CANVAS_PADDING + 500 + 56 + 6}px`, top: `${CANVAS_PADDING + 500 + 28 - 14}px` })
      fireEvent.change(input, { target: { value: 'Sensor gescrollt' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(tree.all()[0].label).toBe('Sensor gescrollt')
    })

    it('verändert Modellpositionen beim Resize und erneutem Öffnen nicht', () => {
      const tree = new FaultTree()
      const node = tree.create('oder', { x: 1400, y: 900 })
      const first = render(<FehlerbaumEditor tree={tree} />)
      fireEvent(window, new Event('resize'))
      expect(tree.layout.get(node.id)).toEqual({ x: 1400, y: 900 })
      first.unmount()
      render(<FehlerbaumEditor tree={tree} />)
      expect(tree.layout.get(node.id)).toEqual({ x: 1400, y: 900 })
    })
  })

})
