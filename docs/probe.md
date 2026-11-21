# Zwischenwert-Sonde (Issue #45)

Agent: Claude Code.

Neues eigenständiges Element in der Palette, neben UND, ODER, Standardeingang und
Kommentarblock (#24). Genau ein Eingang, genau ein Ausgang, reine Durchleitung: in
`src/core/bdd/faultTree.ts` als 1-stelliges UND behandelt, was logisch die Identität
ist — `buildBdd`s balancierte Faltung gibt für genau ein Kind dessen eigenen, bereits
kompilierten BDD-Knoten unverändert zurück. Die Sonde ist damit exakt wirkungslos:
Systemwerte, MCS und Komponententabelle aus #23 sind mit und ohne eingefügte Sonde
identisch (siehe `results.test.ts`, `faultTree.test.ts`). Ein fremd erzeugtes
Dokument mit mehr als einem Eingang an einer Sonde wird trotzdem abgelehnt
(`Probe … must have exactly one input.`) — die Garantie ist eine Strukturinvariante,
keine bloße Editor-Konvention.

Die Sonde zeigt am Element kompakt F(t) und die stationäre Nichtverfügbarkeit
U = 1 − A **des Teilbaums an ihrem Eingang**, nicht des Gesamtsystems.
`buildBddFromDiagramAt` (neue, auf `buildBddFromDiagram` aufbauende Funktion) baut
dafür eine eigene BDD, die an einem beliebigen Knoten statt am TOP wurzelt.
Eine fehlende Reparaturrate blockiert die Nichtverfügbarkeit nur, wenn die
betroffene Komponente tatsächlich im Teilbaum dieser Sonde vorkommt — eine fehlende
Rate in einem anderen Zweig des Baums darf eine sonst berechenbare Sonde nicht
mitblockieren (`results.ts`, `componentsOf`/`needRates`/`needRepair`).

Die Anzeige teilt sich die Berechnung und die Veraltet-Markierung mit dem
Ergebnisbereich aus #23: `ResultsPanel` reicht ihre aktuelle Momentaufnahme über
eine optionale `onResults`-Eigenschaft nach oben, `FehlerbaumanalyseTab` hebt nur
diese eine Momentaufnahme an und gibt sie als `probes`/`probesStale` an
`FehlerbaumEditor` weiter. Jede Sonde führt also keine eigene Berechnung aus; ohne
eine Berechnung über „Berechnen“ zeigt sie „noch nicht berechnet“, bei einer
relevanten Änderung seitdem denselben veralteten Zustand wie der Ergebnisbereich.

Verschieben, Auswählen, Löschen, Umbenennen, Datei-Export/-Import und
Flächenausdehnung folgen der bestehenden, kindunabhängigen Elementbehandlung ohne
Sonderfall. Einziger Unterschied zu UND/ODER: der Eingangs-Stub verschwindet, sobald
ein Eingang verbunden ist (`acceptsInputs` ist dynamisch `nodes.length === 0`), statt
weiter als Ziel angeboten zu werden — dieselbe Oberfläche, die Standardeingänge schon
nie einen Eingangs-Stub zeigen lässt.

## Verifikation am 21. November 2026

259 Tests in 26 Testdateien bestanden, TypeScript-Typecheck, Vite-Produktionsbuild
und Oxlint erfolgreich. Zwei gezielte Revert-Proben: die Sonde-Eingangsgrenze
(`acceptsInputs`) und die teilbaum-begrenzte Reparaturraten-Prüfung wurden jeweils
vorübergehend auf den naiven/alten Stand zurückgesetzt; die zugehörigen neuen Tests
schlugen beide aus dem beschriebenen fachlichen Grund fehl und bestanden nach dem
Wiederherstellen erneut.

Browserprüfung steht noch aus (siehe PR).
