import { describe, expect, it } from 'vitest'
import {
  FaultTree,
  OderVerknuepfung,
  Standardeingang,
  UndVerknuepfung,
} from './model'

const at = { x: 0, y: 0 }

describe('FaultTree', () => {
  it('erzeugt die drei Elementtypen als eigene Klassen mit nodes-Liste', () => {
    const tree = new FaultTree()
    const eingang = tree.create('standardeingang', at)
    const oder = tree.create('oder', at)
    const und = tree.create('und', at)
    expect(eingang).toBeInstanceOf(Standardeingang)
    expect(oder).toBeInstanceOf(OderVerknuepfung)
    expect(und).toBeInstanceOf(UndVerknuepfung)
    for (const element of [eingang, oder, und]) expect(element.nodes).toEqual([])
  })

  it('vergibt eindeutige IDs und fortlaufende Namen je Typ', () => {
    const tree = new FaultTree()
    const a = tree.create('standardeingang', at)
    const b = tree.create('standardeingang', at)
    const c = tree.create('und', at)
    expect(a.id).not.toBe(b.id)
    expect([a.label, b.label, c.label]).toEqual(['Eingang 1', 'Eingang 2', 'UND 1'])
  })

  it('verbindet Ausgang eines Elements mit dem Eingang einer Verknüpfung', () => {
    const tree = new FaultTree()
    const eingang = tree.create('standardeingang', at)
    const oder = tree.create('oder', at)
    expect(tree.connect(eingang.id, oder.id)).toEqual({ ok: true })
    expect(oder.nodes).toEqual([eingang])
    expect(tree.connections()).toEqual([{ childId: eingang.id, parentId: oder.id }])
  })

  it('erlaubt mehrere Eingänge an einer Verknüpfung', () => {
    const tree = new FaultTree()
    const und = tree.create('und', at)
    const a = tree.create('standardeingang', at)
    const b = tree.create('standardeingang', at)
    expect(tree.connect(a.id, und.id).ok).toBe(true)
    expect(tree.connect(b.id, und.id).ok).toBe(true)
    expect(und.nodes.length).toBe(2)
  })

  it('lehnt ungültige Verbindungen ab', () => {
    const tree = new FaultTree()
    const eingang = tree.create('standardeingang', at)
    const anderer = tree.create('standardeingang', at)
    const oder = tree.create('oder', at)
    const und = tree.create('und', at)
    tree.connect(eingang.id, oder.id)
    expect(tree.connect(oder.id, oder.id)).toEqual({ ok: false, error: 'same-element' })
    expect(tree.connect(anderer.id, eingang.id)).toEqual({ ok: false, error: 'no-inputs' })
    expect(tree.connect(eingang.id, oder.id)).toEqual({ ok: false, error: 'already-connected' })
    expect(tree.connect(eingang.id, und.id)).toEqual({ ok: false, error: 'output-taken' })
    expect(tree.connect('x', und.id)).toEqual({ ok: false, error: 'unknown-element' })
  })

  it('verhindert Zyklen, auch über mehrere Ebenen', () => {
    const tree = new FaultTree()
    const oben = tree.create('oder', at)
    const mitte = tree.create('und', at)
    const unten = tree.create('oder', at)
    tree.connect(mitte.id, oben.id)
    tree.connect(unten.id, mitte.id)
    expect(tree.connect(oben.id, unten.id)).toEqual({ ok: false, error: 'cycle' })
  })

  it('trennt Verbindungen wieder', () => {
    const tree = new FaultTree()
    const eingang = tree.create('standardeingang', at)
    const oder = tree.create('oder', at)
    tree.connect(eingang.id, oder.id)
    tree.disconnect(eingang.id, oder.id)
    expect(oder.nodes).toEqual([])
    expect(tree.connect(eingang.id, oder.id).ok).toBe(true)
  })

  it('entfernt ein Element samt Verbindungen, Eingänge bleiben erhalten', () => {
    const tree = new FaultTree()
    const oben = tree.create('oder', at)
    const mitte = tree.create('und', at)
    const eingang = tree.create('standardeingang', at)
    tree.connect(mitte.id, oben.id)
    tree.connect(eingang.id, mitte.id)
    tree.remove(mitte.id)
    expect(tree.get(mitte.id)).toBe(undefined)
    expect(tree.layout.has(mitte.id)).toBe(false)
    expect(oben.nodes).toEqual([])
    expect(tree.parentOf(eingang.id)).toBe(undefined)
    expect(tree.get(eingang.id)).toBeTruthy()
  })
})
