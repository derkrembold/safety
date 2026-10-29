# Interne BDD-Berechnung (Issue #6)

Der öffentliche Einstiegspunkt ist `src/core/bdd/index.ts`, zusätzlich aus
`src/core/index.ts` exportiert. Das Modul hat keine React-Abhängigkeit und benötigt
keine neuen Pakete. Der grafische BDD-Editor bleibt Aufgabe von Issue #4.

## Aus dem gemeinsamen Datenmodell berechnen

```ts
import {
  buildBddFromDiagram,
  systemReliability,
  systemAvailability,
  instantaneousSystemPfd,
  systemPfdAvg,
} from './core'

const diagram = project.diagrams.fehlerbaum
if (!diagram) throw new Error('Kein Fehlerbaum vorhanden.')

const bdd = buildBddFromDiagram(diagram, project.components)
const reliability = systemReliability(bdd, project.components, project.parameters.missionTimeHours)
// Availability requires a repair rate for each relevant component.
const availability = systemAvailability(bdd, project.components)
const qNow = instantaneousSystemPfd(bdd, project.components, 100)
const pfdAvg = systemPfdAvg(bdd, project.components, project.parameters.testIntervalHours)
```

`buildBdd` akzeptiert alternativ direkt die `LogicExpr`-Zwischenrepräsentation
aus #5. `bddFailureProbability` wertet das BDD mit einer
`ReadonlyMap<ComponentId, number>` von momentanen Ausfallwahrscheinlichkeiten aus.

## Anschluss an die Elementklassen des Fehlerbaum-Editors

`buildBddFromElements(root, componentByNode)` akzeptiert strukturell die Klassen
aus #2 (`id`, `kind`, `nodes`), ohne deren UI zu importieren. Die Map ordnet jedem
Standardeingang explizit seine projektweite `ComponentId` zu. Zwei verschiedene
Element-IDs dürfen dieselbe Komponentenidentität referenzieren. Weder Bezeichnung
noch Element-ID werden automatisch als Komponentenidentität interpretiert.

Unterstützte Arten: `basicEvent`/`standardeingang`, `and`/`und`, `or`/`oder`.
Im gemeinsamen Diagrammformat zeigt eine Kante vom Gatter zu seinem Eingang.
Zyklen, mehrere TOP-Kandidaten, hängende Kanten, unbekannte Komponenten,
unbekannte Gatterarten und Gatter ohne Eingänge werden für Berechnungen abgelehnt.
Unvollständige Diagramme bleiben unabhängig davon im Editor bearbeitbar.

## Logik und Repräsentation

- Eine Variable ist wahr, wenn die Komponente **ausgefallen** ist.
- Terminal **0** bedeutet System funktioniert, Terminal **1** System ausgefallen.
- `low` folgt dem Zweig „Komponente funktioniert“, `high` dem Ausfallzweig.
- Die Reihenfolge wird automatisch lexikografisch aus den Komponenten-IDs
  bestimmt. Eine explizite Reihenfolge muss jede referenzierte Identität genau
  einmal enthalten.
- Gleiche `(Variable, low, high)`-Tripel werden interniert; Entscheidungen mit
  gleichen Nachfolgern entfallen. Nicht erreichbare Zwischenknoten werden entfernt.
- Die zurückgegebenen Arrays und Knoten sind eingefroren. Kinder haben kleinere
  Knotenindizes als ihre Eltern; die Wahrscheinlichkeitsauswertung ist linear in
  der Größe des reduzierten Graphen.
- `maxNodes` begrenzt auch temporäre Knoten (Standard: 100.000). Wird das Budget
  überschritten, erfolgt ein ausdrücklicher Fehler. Eine Reihenfolge kann die
  Größe eines BDD stark beeinflussen; generell ist exponentielles Wachstum möglich.

## Wahrscheinlichkeiten

Jede Komponentenidentität wird einmal gewichtet. Shannon-Auswertung:
`Q(v) = (1-q) * Q(low) + q * Q(high)`. So werden gemeinsam verwendete
Komponenten korrekt berücksichtigt; Teilbäume werden nicht pauschal als
unabhängig behandelt.

Für Zuverlässigkeit gilt je Komponente `R(t)=exp(-lambda*t)`, für stationäre
Verfügbarkeit `A=mu/(lambda+mu)`. Beide Zweiggewichte werden direkt berechnet,
damit kleine Wahrscheinlichkeiten nicht durch Subtraktion verloren gehen.
Negative/nicht endliche Werte, fehlende Komponenten oder fehlende Reparaturraten
bei der Verfügbarkeitsberechnung führen zu Fehlern. Missionsdauer und momentane
Prüfzeit dürfen null sein; das Prüfintervall muss positiv sein. Zwei Nullraten
definieren keine eindeutige stationäre Verfügbarkeit und werden abgelehnt.

PFDavg verwendet die Modellannahmen aus `Konzept.md`: `lambda_DU=lambda`,
synchrone perfekte Prüfungen, `q_i(t)=min(1, lambda_i*t)`. Zuerst wird die
momentane Systemwahrscheinlichkeit über das BDD berechnet, dann über ein
Prüfintervall gemittelt. Für 1oo2 ergibt sich dadurch
`lambda^2*tau^2/3` und nicht das Produkt der Komponentenmittelwerte.

Das Integral wird mit `u=t/tau` auf `[0,1]` normiert, an den Sättigungspunkten
geteilt und adaptiv nach Simpson integriert. Standard: relatives Fehlerziel
`1e-8`, absolutes Fehlerziel `0`, höchstens 100.000 Auswertungen und Tiefe 24.
Das globale Fehlerbudget erhält auch für sehr seltene redundante Ausfälle die
relative Genauigkeit. Nichtkonvergenz, Budgetüberschreitung und ein numerischer
Überlauf von `lambda*tau` werden als Fehler gemeldet. Die Fehlerkontrolle ist
eine numerische Simpson-Schätzung, kein formaler Beweis einer Fehlerschranke.

## Tests und Integration

`npm test` prüft Wahrheitstabellen gegen die bestehende Logik-Auswertung,
gewichtete vollständige Zustandsaufzählung, Reduktions- und Ordnungsinvarianten,
geteilte Komponenten, beide Fehlerbaumformate, analytische PFDavg-Fälle,
Clamping, numerische Randfälle und tiefe/große Modelle.

Dieser Branch baut auf `master`-Commit `d6dee37` auf, der sowohl das Datenmodell
aus PR #10 als auch den Fehlerbaum-Editor aus PR #13 enthält. Der Adaptertest
verwendet dessen tatsächliche Elementklassen. Die eigene Änderung für #6 liegt
unter `src/core/bdd/`, im Core-Export sowie in der Dokumentation mit README-Link.
