# Safety

Eine Software für Safety Engineering mit drei Reitern: **Fehlerbaumanalyse**, **Zuverlässigkeitsdiagramm** und **Binary Decision Diagram (BDD)**. Alle drei Reiter beschreiben dasselbe System, nur in unterschiedlicher Darstellung — jede Darstellung lässt sich automatisch aus einer der beiden anderen ableiten.

Das Projekt entsteht im Rahmen des Praktikums Betriebssicherheit am Institut für Echtzeitsysteme und Softwaretechnik.

## Konzept und Anforderungen

- [`Konzept.md`](Konzept.md) — Gesamtkonzept: Plattform, UI-Prinzip, Berechnungsgrundlagen, Spielregeln für die Mitarbeit
- [`requirements/`](requirements) — Detaillierte Anforderungen je Reiter:
  - [Fehlerbaumanalyse](requirements/Fehlerbaumanalyse.md)
  - [Zuverlässigkeitsdiagramm](requirements/Zuverlaessigkeitsdiagramm.md)
  - [Binary Decision Diagram](requirements/Binary%20Decision%20Diagram.md)

## Entwicklung

Tech-Stack: React + TypeScript + Vite.

```
npm install
npm run dev     # Dev-Server
npm run build   # Typecheck + Produktions-Build
```

Die interne BDD-Berechnung aus Issue #6 ist in [`docs/bdd.md`](docs/bdd.md)
mit Schnittstellen, Modellannahmen und numerischen Grenzen beschrieben.

## Design (Issue #20)

Stilreferenz ist das Omarchy-Theme "Tokyo Night" (siehe [`Konzept.md`, Abschnitt "Design"](Konzept.md#design)). Alle Farb- und Schrift-Tokens sind zentral in `src/index.css` als CSS-Variablen definiert (`--bg`, `--bg-raised`, `--bg-sunken`, `--text`, `--text-h`, `--text-muted`, `--border`, `--accent`, `--accent-strong`, …). Komponenten referenzieren ausschließlich diese Variablen, keine Farbwerte direkt — neue Reiter übernehmen den Look dadurch automatisch, ohne eigenes Styling. Nebenaktionen (Projekt-Export/-Import, Debug-Log-Export) teilen sich eine gemeinsame Button-Regel in `src/App.css`.

## Mitmachen

1. Ein offenes [Issue](https://github.com/derkrembold/safety/issues) aussuchen (oder im [Project-Board](https://github.com/users/derkrembold/projects/3) nachsehen, was noch offen ist).
2. Repo forken, eigenen Branch anlegen (`issue-<nr>-kurzbeschreibung`).
3. Pull Request öffnen, der das Issue referenziert (`Closes #<nr>`).
4. Codex schaut sich den PR an und kommentiert (ändert keinen Code). Offene Punkte werden von dir oder dem Dozenten gelöst.
5. Merge erfolgt ausschließlich durch den Dozenten.

Details zu den Regeln: siehe [`Konzept.md`, Abschnitt "Spielregeln"](Konzept.md#spielregeln).

## Debug-Logging (Issue #7)

Die Anwendung verwendet React, TypeScript und Vite. Zum Starten werden Node.js ab 22.12 und npm benötigt:

```sh
npm install
npm run dev
```

`npm run build` prüft TypeScript und erzeugt den Produktionsbuild in `dist/`. `npm run lint` führt die Codeprüfung aus. `npm test` führt die Testsuite mit Vitest und React Testing Library aus. `npm run preview` zeigt den Build lokal an.

Die Tests für Issue #7 liegen in `src/debug/logger.test.ts` und `src/debug/DebugControls.test.tsx`. Sie prüfen Debug-Umschaltung, synchrone und asynchrone Fehler, globale Fehlerbehandlung, Puffergrenze und Verdrängung alter Einträge, gekürzte übergroße Fehler sowie Export-Metadaten. Die React-Tests prüfen die Bedienelemente, die ausdrückliche Auswahl eines Projektstands, den Download-Aufruf und die Rückmeldung bei Exportfehlern. Browser-Downloads werden in der Testumgebung simuliert.

`src/debug/logger.ts` enthält den typisierten Logger. Der Debug-Modus erfasst fachliche Aktionen; Fehler werden immer erfasst. Der Puffer hält höchstens 5 MiB JSON-Einträge und verwirft bei Bedarf die ältesten. Überlange Einträge werden gekürzt und markiert. Die Grenze betrifft die UTF-8-Daten der Einträge, nicht den gesamten JavaScript-Heap oder den Export mit optionalem Projektstand. Logs bleiben im Arbeitsspeicher und gehen beim Neuladen verloren.

Die React-Komponente `DebugControls` bietet einen Schalter und JSON-Download. Solange "Debug-Modus" ausgeschaltet ist, zeigt die Leiste nur diesen Schalter; die übrigen Bedienelemente (Projektstand-Option, Export-Button, Statusmeldung) klappen erst nach dem Einschalten auf (Issue #20, UI-Entwurf). Das Erfassen von Fehlern im Logger selbst ist davon unabhängig und läuft immer, auch bei ausgeschaltetem Debug-Modus — nur der Export-Button ist bis zum Einschalten nicht sichtbar. Wird `getProjectState` übergeben, kann der Benutzer den Projektstand ausdrücklich zum Export hinzufügen. Alle zukünftigen Reiter nutzen dieselbe Instanz aus `src/debug/appLogger.ts`:

```tsx
import { appLogger } from './debug/appLogger';
import { DebugControls } from './debug/DebugControls';

appLogger.logAction('gate-connected', { componentIds: ['gate-1', 'input-2'] });
const result = appLogger.runAction('reliability-calculation', () => calculateReliability(), {
  componentIds: ['gate-1'],
});
appLogger.logAction('tab-converted', { componentIds: ['gate-1'] });

// In der App-Toolbar; currentProject muss JSON-serialisierbar sein:
<DebugControls logger={appLogger} getProjectState={() => currentProject} />
```

`runAction` zeichnet fehlgeschlagene synchrone und asynchrone Berechnungen auch bei ausgeschaltetem Debug-Modus auf und gibt Fehler weiter. Unbehandelte Browser-Fehler, Promise-Ablehnungen und React-Renderfehler werden ebenfalls erfasst. Der Export enthält Zeitstempel, Aktion, Komponenten-IDs, Fehlermeldung und Stacktrace, sofern verfügbar, sowie App-Version, Commit-ID und Browser-Version. Vite liest die Version aus `package.json` und die Commit-ID beim Start beziehungsweise Build aus Git; ohne Git-Metadaten lautet die ID `unknown`. Die Logging-Bedienelemente stehen über allen drei Reitern bereit. Reiterwechsel und Projektimport/-export verwenden den gemeinsamen Logger. Der Projektstand kann beim Log-Export optional beigefügt werden. Die Diagramm-Editoren entstehen in eigenen Issues.

## Fehlerbaum und Projektdatei (Issue #15)

Der Projektzustand ist die gemeinsame Quelle für Editor, Projektdatei und den optionalen
Projektstand im Debug-Export. Der Editor arbeitet auf einer daraus aufgebauten Projektion;
jede Änderung schreibt Knoten, Verbindungen, Beschriftungen und Layout zurück ins Projekt.
Ein Import ersetzt den Baum einschließlich der laufenden Auswahl und Mausaktionen. Fehler
beim Lesen oder beim Aufbau des Fehlerbaums erhalten den bisherigen Projektzustand.

Fehlerbaum-Knoten werden als `basicEvent`, `and` und `or` gespeichert. Der Import versteht
auch die Editor-Bezeichnungen `standardeingang`, `und` und `oder`. Standardeingänge erhalten
eine eigene `componentRef`; mehrfach vorkommende importierte Komponenten behalten ihre
geteilte Identität. Umbenennen ändert die Beschriftung des Vorkommens, nicht die Identität
oder die Registry. Vorhandene Raten und weitere Registry-Angaben bleiben erhalten.
Neue Komponenten erhalten zunächst `failureRate: 0` ausschließlich in der Registry. Dieser
Platzhalter wird von der fachlichen Validierung als noch nicht eingegebene Rate erkannt.
Beim Löschen eines Vorkommens bleibt die Komponente für mögliche weitere Verwendungen erhalten.

Unverbundene Elemente und Gatter ohne Eingänge dürfen gespeichert und wieder geladen
werden. Unbekannte Elementtypen, fehlende Komponentenreferenzen und nicht darstellbare
Verbindungen (z. B. Zyklen oder mehrere Eltern eines Vorkommens) werden beim Import abgelehnt.
Die Integrationstests in `src/App.integration.test.tsx` prüfen den Datei-Roundtrip über die
App-Bedienelemente und den tatsächlichen Debug-Download; Downloads werden als Blob abgefangen.

## Fachliches Editor-Logging (Issue #16)

Bei aktiviertem Debug-Modus protokolliert der Fehlerbaum-Editor erfolgreiche Änderungen
als `fault-tree-element-created`, `fault-tree-connected`, `fault-tree-disconnected`,
`fault-tree-element-deleted`, `fault-tree-element-renamed` und `fault-tree-element-moved`.
Die Verschiebung erzeugt einen Eintrag beim Loslassen, sofern sich die Position geändert
hat; einzelne Mausbewegungen, Tastatureingaben, Auswahl und Größenanpassungen werden nicht
als Aktionen gespeichert. Abgebrochene oder abgelehnte Verbindungen und unveränderte oder
leere Namen erzeugen keinen Erfolgseintrag.

Die optionalen `nodeIds` im gemeinsamen Logformat bezeichnen Diagramm-Vorkommen,
`componentIds` ausschließlich referenzierte Identitäten aus der Komponenten-Registry.
Gatter haben keine Komponentenidentität. Mehrere Vorkommen derselben Komponente liefern
unterschiedliche Knoten-IDs und dieselbe, deduplizierte Komponenten-ID. Beim Löschen werden
die IDs vor dem Entfernen erfasst, einschließlich der von entfernten Verbindungen
betroffenen Nachbarn. Die Log-Erweiterung ist additiv; bestehende Einträge ohne `nodeIds`
und das Exportformat mit `formatVersion: 1` bleiben gültig.

Ohne Debug-Modus bleiben normale Editoraktionen ungespeichert. Tatsächliche Exceptions bei
Editoränderungen werden mit Aktion, betroffenen IDs und Stacktrace auch dann erfasst und
weitergereicht. Der optionale Projektstand im Debug-Download verwendet weiterhin das
gemeinsame Projektmodell. `src/fehlerbaum/logging.integration.test.tsx` prüft die echte
App-Bedienung und den heruntergeladenen JSON-Blob einschließlich geteilter Identitäten,
Fehlern bei deaktiviertem Debug-Modus und abgebrochenen bzw. abgelehnten Verbindungen.
