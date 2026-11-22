# Höhe des Elementfelds (Issue #42)

Agent: Claude Code.

Das Elementfeld (die Zeichenfläche des Fehlerbaum-Editors) hat jetzt einen eigenen
Höhenregler, direkt über dem Feld — dasselbe Bedienmuster wie der bestehende
"Höhe Ergebnisbereich"-Regler aus #23 (Label, Schieberegler, px-Anzeige), über die
gemeinsame CSS-Klasse `.ft-height-slider` tatsächlich gleich aussehend, nicht nur ein
separat gepflegter Nachbau.

Das Elementfeld hatte zuvor keine eigene, einstellbare Höhe: `.ft-canvas-frame` nutzte
`flex: 1` und füllte nur den nach Hinweiszeile/Ergebnisbereich übrigen Platz. Jetzt
bekommt es stattdessen eine explizite Höhe aus dem Reglerwert (Default 560px, Bereich
200–1400px in 10px-Schritten) — wie der Ergebnisbereich, dessen Höhe ebenfalls explizit
vom eigenen Regler kommt, nicht von flex-Wachstum.

Betrifft nur die Höhe dieses einen Bereichs; eine verschiebbare Trennlinie oder ein
Einklappen bleiben als Alternativen für #42 offen (siehe Issue-Kommentar), hier nicht
umgesetzt.

## Verifikation am 22. November 2026

267 Tests in 26 Testdateien bestanden (neuer Test prüft Regler-Zugänglichkeit über
denselben Accessible-Name-Regex wie der Ergebnisbereich-Regler, die geteilte CSS-Klasse
und dass eine Reglerbewegung die tatsächliche Höhe des Elementfelds ändert; per
Revert-Probe bestätigt). TypeScript-Typecheck, Vite-Produktionsbuild und Oxlint
erfolgreich.

Zwei bereits vor dieser Änderung bestehende, von ihr unabhängige Zeitüberschreitungen
(`App.integration.test.tsx`, `logging.integration.test.tsx`) treten nur unter CPU-Last
beim vollständigen Testlauf auf (5000ms-Standardlimit); mit `--testTimeout=20000`
bestehen alle 267 Tests. Gegen den unveränderten `master`-Stand vor dieser Änderung
reproduziert — keine Regression dieser Änderung, nicht behoben.

Kein manueller Browsertest — kein Browser-Tooling in dieser Session verfügbar.
