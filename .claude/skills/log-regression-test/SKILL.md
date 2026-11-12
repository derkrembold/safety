---
name: log-regression-test
description: Turn a debug-export log from this app (shape defined in src/debug/logger.ts, exported as safety-debug-*.json) plus Derk's description of the correct behavior into a committable Vitest regression test. Use whenever Derk reports a bug together with an exported debug log, asks to turn a bug report or log into a test, or wants a regression test for something that was just fixed. Always ask for the expected-behavior description if it wasn't given, and say so explicitly when the log itself lacks a value the reproduction needs (e.g. no resulting position in an older export) — never infer either one from the log's own, possibly buggy, outcome.
---

# Vom Debug-Log zum Regressionstest

Dieser Skill setzt Issue #30 um: Derk meldet einen Fehler zusammen mit einem Debug-Export: daraus soll ein nachvollziehbarer, deterministischer Vitest-Test entstehen, der den Fehler reproduziert und nach der Korrektur besteht — ohne dass dabei Soll-Werte aus dem (möglicherweise selbst fehlerhaften) Log erfunden werden.

## Warum die Reihenfolge unten wichtig ist

Ein Log zeigt nur, was passiert ist — nie, was passieren sollte. Genau diese Verwechslung ist der gefährlichste Fehler hier: ein beobachteter, falscher Wert aus dem Log als erwarteten Wert in den Test zu schreiben, würde den Bug einfrieren statt ihn zu fangen. Deshalb kommt die Sollbeschreibung immer von Derk, nie aus den Log-Daten selbst.

## Was du brauchst, bevor du einen Test schreibst

1. **Der Debug-Export** (JSON, Format siehe `src/debug/logger.ts`): `formatVersion`, `appVersion`, `commitId`, `entries[]`.
2. **Die Ausgangslage**: entweder ein von Derk ausdrücklich bestätigtes leeres Projekt mit vollständig aufgezeichneten relevanten Aktionen, in dem jede referenzierte ID zuerst erzeugt wird, oder ein expliziter Projektexport von *vor* den relevanten Aktionen. Geschlossene ID-Referenzen allein beweisen keinen leeren Start — Derk kann ein bestehendes Projekt geöffnet, erst danach das Debugging eingeschaltet und nur ein neues Element bearbeitet haben; dann ist der Log-Ausschnitt in sich geschlossen, obwohl unberührte alte Elemente die Canvas-Grenzen weiterhin mitbestimmen. Auch das Fehlen von `truncated: true` beweist keine Vollständigkeit: der Ringpuffer verdrängt alte Einträge bei normalem Überlauf ohne dieses Kennzeichen zu setzen (das markiert nur das Kürzen eines einzelnen übergroßen Eintrags). Ist der Start nicht belegt: nachfragen, oder den Test ausdrücklich als repräsentativen Minimalfall mit unbestätigter Ausgangslage kennzeichnen. Ein Export von *nach* dem Fehler reicht nicht als Startzustand; er zeigt das fehlerhafte Ergebnis.
3. **Derks Beschreibung des erwarteten Verhaltens.** Frag danach, wenn sie fehlt oder mehrdeutig ist, statt zu raten.

Fehlt 1 oder 2 ganz, oder lässt sich 3 nicht eindeutig in eine Prüfung übersetzen: sag das konkret und frag nach. Rate nicht weiter.

## Ablauf

### 1. Log validieren

- `formatVersion` bekannt? (aktuell: 1 — bei einer höheren Version im Zweifel nachfragen, was sich geändert hat.)
- Irgendein Eintrag `truncated: true`? Der Ringpuffer hat dann etwas verworfen, das für die Reproduktion wichtig gewesen sein könnte — melden, nicht ignorieren.
- Jede `action` bekannt? (Aktuelle Liste: in `FehlerbaumEditor.tsx` nach `editorAction(tree, '...'` suchen.) Eine unbekannte Aktion melden statt zu interpretieren.
- Fehlt bei einer für die Reproduktion relevanten Aktion das `details`-Feld (ältere Exporte von vor PR #37 haben es nicht, oder die Aktion braucht es schlicht nicht)? Wenn die fehlenden Werte wirklich gebraucht werden (z. B. die Zielposition bei einem Verschieben-Bug), sag ausdrücklich, dass der Log dafür nicht reicht — schlag entweder einen frischen Export mit `details` oder einen *repräsentativen* Minimalfall vor (siehe Schritt 2), statt eine Position zu erfinden, die wie aus dem Log stammt.

### 2. Ausgangslage und Aktionen auf Domänenebene nachbilden

Für jeden relevanten Eintrag in `entries`, in Reihenfolge: die passende öffentliche Modell-/Editorfunktion mit den Werten aus `details` und `nodeIds` aufrufen.

| `action` | ruft auf |
|---|---|
| `fault-tree-element-created` | `tree.create(details.kind, details.position)` |
| `fault-tree-element-moved` | `tree.layout.set(nodeId, details.position)` |
| `fault-tree-element-renamed` | `element.label = details.label` |
| `fault-tree-connected` | `tree.connect(details.childId, details.parentId)` |
| `fault-tree-disconnected` | `tree.disconnect(details.childId, details.parentId)` |
| `fault-tree-element-deleted` | `tree.remove(nodeId)` |
| `fault-tree-comment-created` | `tree.createComment(details.position)` (neue Kennung; `details.commentId` darauf abbilden) |
| `fault-tree-comment-edited` | `comment.text = details.text` |
| `fault-tree-comment-moved` | `comment.position = details.position` |
| `fault-tree-comment-deleted` | `tree.removeComment(commentId)` |

Kommentare haben keine `nodeIds`; ihre Kennung steht in `details.commentId`.

Bevorzuge diese Core-Ebene (`src/fehlerbaum/model.ts`, `FaultTree`): sie ist schneller, deterministisch, und der Log liefert dafür bereits alles Nötige.

**Ausnahme — wenn der Fehler in der React-Komponente selbst sitzt:** manche Fehler leben im Event-Handling, in Closures oder im Render-/Scroll-Timing der Editor-Komponente, nicht im Modell. (Beispiel aus der Praxis: eine `onMove`-Closure, die beim Pointer-Down registriert wurde und über mehrere Renders hinweg einen veralteten Koordinatenursprung festhielt, statt den aktuellen aus einer Ref zu lesen.) Ein reiner Core-Test übergeht diese Schicht komplett und kann den Fehler gar nicht zeigen. Dann stattdessen `fireEvent.pointerDown/pointerMove/pointerUp` mit echten `clientX/clientY`-Werten verwenden, wie es die bestehenden `*.test.tsx`-Dateien schon tun — und dafür reicht der Log allein ohnehin nicht: du brauchst Derks eigene Beschreibung der Zeiger-Sequenz (wann/wohin gezogen wurde), nicht nur resultierende Positionswerte.

Baue dabei kein generisches Aufzeichnen/Abspielen roher Mausbewegungen — das ist nicht das Ziel von #30, sondern pro Fall ein paar gezielte `fireEvent`-Aufrufe.

### 3. Testvorschlag schreiben

Lege ihn unter `src/regression/<issue-oder-datum>-<kurzbeschreibung>.test.ts(x)` ab — ein eigener Ordner für log-abgeleitete Regressionstests, getrennt von den komponentennahen Tests, damit die Herkunft auf den ersten Blick erkennbar bleibt. Jeder Test bekommt einen Kommentarblock mit Herkunft, und drei klar getrennte Abschnitte:

```ts
/**
 * Herkunft: <Issue/PR-Nummer oder Beschreibung des Fehlerberichts>
 * Log: <Dateiname + relevante entries[]-Indizes, oder "repräsentativer Minimalfall, da Log unvollständig">
 * Betroffene Version: commitId <...>
 * Annahmen: <was ergänzt/angenommen wurde, falls im Log etwas fehlte>
 */
import { describe, expect, it } from 'vitest'

it('<beschreibt das erwartete Verhalten, nicht den Bug>', () => {
  // Ausgangslage
  ...
  // Aktionen (aus dem Log, in Reihenfolge)
  ...
  // Erwartetes Ergebnis — von Derk beschrieben, NICHT aus dem Log übernommen
  expect(...).toEqual(...)
})
```

### 4. Gegen den gemeldeten und den korrigierten Stand prüfen

Ist der fehlerhafte Code noch erreichbar (bestimmter Commit/Branch)? Frag nach, bevor du dorthin wechselst — das ist ein Kontextwechsel im Repo. Lass den Test dagegen laufen und bestätige, dass er aus dem beschriebenen fachlichen Grund scheitert, nicht an einem Infrastrukturfehler (fehlender Import, falscher Pfad, Tippfehler im Test selbst). Ist der fehlerhafte Stand nicht mehr erreichbar, sag das ausdrücklich als Verifikationslücke, statt "reproduziert" zu behaupten.

Ist bereits eine Korrektur vorhanden: Test auch dagegen laufen lassen — er muss bestehen.

### 5. Übergeben

Zeig Derk den Testvorschlag und kurz deine Herleitung (welche Log-Einträge, welche Annahmen, welches Ergebnis am fehlerhaften/korrigierten Stand). Füg ihn nur mit seinem ausdrücklichen Auftrag zum Repo hinzu (Branch/Commit/PR) — wie bei jeder anderen Änderung an diesem Projekt.

## Grenzen (aus den Akzeptanzkriterien von #30)

- Nie Sollverhalten aus dem Log selbst ableiten.
- Nie einen beobachteten, möglicherweise falschen Wert als erwarteten Wert festschreiben.
- Kein fertiger Test darf von zufälligen IDs oder der aktuellen Uhrzeit abhängen — durch feste Platzhalter ersetzen.
- Keine Änderung an Produktivcode, kein Issue/PR ohne Auftrag.
