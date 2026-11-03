/**
 * Herkunft: Derks Testsession zur Prüfung des erweiterten Logformats (PR #37, 2026-11-03).
 * Log: safety-debug-2026-11-03T14-11-53-527Z.json, alle 21 Einträge (created/moved/connected
 * mit details, formatVersion 1, commitId 4593148e0df...).
 * Betroffene Version: commitId 4593148e0df096b46f8c2a1e3bbf42b0cf4820ff (nach PR #37, enthält
 * auch die Korrekturen aus PR #35/#36 zum mehrseitigen Wachstum der Zeichenfläche).
 * Annahmen: Die im Log zufällig vergebenen Element-/Komponenten-IDs werden nicht übernommen
 * (Grenzen von #30) — nur Erstellreihenfolge (bestimmt die Default-Labels), Positionen und
 * Verbindungsrollen (childId/parentId) stammen aus den details-Feldern des Logs. Positionen
 * auf 3 Nachkommastellen gerundet (vermeidet ein Lint-Literal-Präzisionsproblem, ändert an
 * der Aussage nichts — die erwartete Größe wird aus denselben gerundeten Werten berechnet).
 *
 * Sollbeschreibung (Derk): Nach dieser Abfolge soll die Zeichenfläche sichtbar in mehrere
 * Richtungen gewachsen sein — Eingang 1 zieht den linken Rand, ODER 1 den oberen Rand ins
 * Negative, während Eingang 4 weit rechts und Eingang 2 weit unten liegen. Scrollbars müssen
 * also horizontal UND vertikal nötig sein.
 *
 * Verifikationshinweis: Diese Session hat an jedem Rand ein anderes Element (Eingang 1 ≠
 * Eingang 4 ≠ ODER 1 ≠ Eingang 2) — der in PR #36 behobene Fehler trat nur auf, wenn ein
 * EINZELNES Element gleichzeitig beide Enden einer Achse definierte. Am tatsächlich
 * gemergten PR-#36-Fehlerstand geprüft: dieser Test bestand dort unverändert (kein
 * Regressionswächter für #36 — das leisten die dedizierten Tests in geometry.test.ts und
 * FehlerbaumEditor.test.tsx). Dieser Test prüft stattdessen die allgemeinere Eigenschaft,
 * dass mehrseitiges Wachstum bei einer echten, verteilten Mehr-Elemente-Session korrekt bis
 * in die gerenderte Fläche durchschlägt.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FehlerbaumEditor } from '../fehlerbaum/FehlerbaumEditor'
import { FaultTree } from '../fehlerbaum/model'
import { CANVAS_PADDING, canvasOrigin, canvasSize, sizeOf } from '../fehlerbaum/geometry'

describe('mehrseitiges Wachstum aus einer echten Mehr-Elemente-Session', () => {
  afterEach(() => vi.restoreAllMocks())

  it('öffnet Scrollbars horizontal und vertikal, getrieben von Elementen auf beiden Seiten', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)

    // Ausgangslage: leeres Projekt — der Log ist in sich geschlossen (jede referenzierte
    // ID wird zuerst selbst per "created" angelegt).
    const tree = new FaultTree()

    // Aktionen, aus den details-Feldern des Logs, in exakter Reihenfolge.
    const oder1 = tree.create('oder', { x: 279.264, y: -1.580 })
    const oder2 = tree.create('oder', { x: 119.264, y: 102.839 })
    const und1 = tree.create('und', { x: 379.264, y: 83.839 })
    const eingang1 = tree.create('standardeingang', { x: 6.264, y: 232.839 })
    tree.layout.set(eingang1.id, { x: 39.023, y: 253.770 })
    tree.layout.set(eingang1.id, { x: -165.805, y: 256.865 })
    const eingang2 = tree.create('standardeingang', { x: 150.402, y: 222.839 })
    tree.connect(eingang1.id, oder2.id)
    tree.connect(eingang2.id, oder2.id)
    tree.layout.set(eingang2.id, { x: 118.891, y: 352.351 })
    const eingang3 = tree.create('standardeingang', { x: 336.402, y: 230.839 })
    const eingang4 = tree.create('standardeingang', { x: 435.402, y: 322.839 })
    tree.layout.set(eingang4.id, { x: 440.747, y: 346.204 })
    tree.connect(eingang3.id, und1.id)
    tree.connect(eingang4.id, und1.id)
    tree.layout.set(oder1.id, { x: 244.839, y: -76.431 })
    tree.connect(oder2.id, oder1.id)
    tree.connect(und1.id, oder1.id)
    tree.layout.set(oder2.id, { x: -27.250, y: 68.431 })
    tree.layout.set(eingang4.id, { x: 522.532, y: 314.224 })
    tree.layout.set(oder1.id, { x: 237.718, y: -116.908 })

    render(<FehlerbaumEditor tree={tree} />)

    const items = tree.all().map((element) => ({
      kind: element.kind, label: element.label, position: tree.layout.get(element.id)!,
    }))

    // Erwartetes Ergebnis: Ursprung liegt links UND oben im Negativen — zwei
    // verschiedene Elemente (Eingang 1 bzw. ODER 1) ziehen an verschiedenen Rändern.
    const origin = canvasOrigin(items)
    expect(origin.x).toBeLessThan(0)
    expect(origin.y).toBeLessThan(0)

    // Die gerenderte Fläche entspricht der berechneten Größe (Integrationscheck: der
    // Editor verdrahtet Ursprung/Elemente/Viewport korrekt in canvasSize).
    const expectedSize = canvasSize(items, { w: 200, h: 200 }, undefined, undefined, origin)
    const surface = screen
      .getByRole('region', { name: 'Fehlerbaum-Zeichenfläche' })
      .querySelector('.ft-surface') as HTMLElement
    expect(parseFloat(surface.style.width)).toBe(expectedSize.w)
    expect(parseFloat(surface.style.height)).toBe(expectedSize.h)

    // Scrollbars sind horizontal UND vertikal nötig: die Fläche übersteigt den
    // 200×200-Viewport in beiden Achsen.
    expect(expectedSize.w).toBeGreaterThan(200)
    expect(expectedSize.h).toBeGreaterThan(200)

    // Die Breite/Höhe erklärt sich nicht allein aus der rechten/unteren Seite: links/oben
    // (Eingang 1, ODER 1) trägt eigenständig zum Platzbedarf bei, nicht nur rechts/unten
    // (Eingang 4, Eingang 2) — echtes Wachstum von beiden Seiten, nicht nur optisch groß.
    const rightAlone = Math.max(
      ...items.map((item) => item.position.x + sizeOf(item.kind).w + 10 + Array.from(item.label).length * 14),
    )
    const bottomAlone = Math.max(...items.map((item) => item.position.y + sizeOf(item.kind).h))
    expect(expectedSize.w).toBeGreaterThan(Math.ceil(rightAlone + 2 * CANVAS_PADDING))
    expect(expectedSize.h).toBeGreaterThan(Math.ceil(bottomAlone + 2 * CANVAS_PADDING))
  })
})
