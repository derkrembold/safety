# Fehlerbaum-Ergebnisbereich (Issue #23)

Agent: Codex.

Unter der Zeichenfläche löst „Berechnen“ die BDD-Berechnung und MCS-Ermittlung aus.
Der Bereich ist einklappbar, über den beschrifteten Schieberegler per Tastatur und
über den unteren Resize-Griff mit der Maus höhenverstellbar. MCS und die separate
Komponententabelle besitzen begrenzte Scrollbereiche.

R(t)/F(t), stationäre A/U sowie System-PFDavg sind getrennte Größen. Sehr kleine
Zahlen erscheinen in wissenschaftlicher Schreibweise. F(t) und U werden direkt
über Ausfallgewichte ausgewertet, um die Auslöschung kleiner Werte bei `1-R` bzw.
`1-A` zu vermeiden. Die vorhandene BDD-Engine wertet gemeinsame Identitäten aus;
MCS werden aus ihrem monotonen ROBDD gebildet und enthalten keine Duplikate oder
echten Obermengen. Arbeits-, Speicher- und Mengengrenzen führen zu einer Meldung,
nie zu einer als vollständig dargestellten Teilliste.

Der Ergebnisstand enthält Berechnungszeitpunkt, Modellzeitstempel, t und τ.
Eine Eingabesignatur prüft Logik, verwendete Registry-Einträge und Parameter.
Positionsänderungen allein erfordern keine Neuberechnung. Nach relevanten Änderungen
bleiben bisherige Werte einschließlich der Tabelle ausdrücklich als veraltet sichtbar.
Projektimporte setzen den Ergebnisbereich zurück; Reiterwechsel verwerfen die
Anzeige ebenfalls und verlangen eine neue Berechnung.

Entsprechend der bestehenden Core-Validierung müssen λ, μ (sofern angegeben), t
und τ endlich und strikt positiv sein. λ=0 ist im aktuellen Editor der Platzhalter
für eine noch nicht eingegebene Rate. Fehlendes oder ungültiges μ blockiert nur A/U.
MCS sind von Raten unabhängig. Die inzwischen integrierte Parametereingabe aus
Issue #25 bearbeitet Komponentenraten und projektweite Zeiten im selben Projektzustand.
Gespeicherte Änderungen markieren vorhandene Ergebnisse als veraltet.
Ein kleines Beispiel liegt in `docs/examples/results.safety.json` (Projekt importieren,
danach Berechnen). Das Beispiel verwendet ein ODER mit Sensor und Ventil.

Low-Demand-Bänder: SIL 4 [1e-5,1e-4), SIL 3 [1e-4,1e-3), SIL 2 [1e-3,1e-2),
SIL 1 [1e-2,1e-1). Unterhalb von 1e-5 wird ausdrücklich keine höhere SIL-Stufe
vergeben; ab 0,1 liegt der Wert außerhalb der Bänder. Die Anzeige ist nur eine
rechnerische Zuordnung unter den Annahmen aus Konzept.md, kein SIL-Nachweis.
Quelle der Bandgrenzen: [Siemens Safety Engineering System Manual, SIL-Tabelle](https://support.automation.siemens.com/WW/llisapi.dll/csfetch/12490443/s7_safety_engineering_system_manual_en-US_en-US.pdf).

Tests: `npm run test`, `npm run build`, `npm run lint`.

## Verifikation am 12. November 2026

214 Tests bestanden, Typecheck, Produktionsbuild und Oxlint erfolgreich.
Getestet mit den Versionen aus `package-lock.json` (Vitest 5.0.5, React 19.3.1,
Vite 8.3.5, TypeScript 7.0.2). Die lokale Paketinstallation erfolgte mit dem
vorhandenen pnpm über eine temporär aus der npm-Lockdatei importierte Lockdatei;
die Projektabhängigkeiten und die npm-Lockdatei sind unverändert.

Browserprüfung auf `http://127.0.0.1:5173`: Beispieldatei über den echten
Projektimport geladen, Berechnen ausgelöst und Tabelle geöffnet. Beobachtete
Systemwerte: R(t) ≈ 0,9970045, F(t) ≈ 0,002995504, A ≈ 0,99995,
U ≈ 4,99979e-5, PFDavg ≈ 0,01308884 (Band SIL 1). MCS: Sensor bzw. Ventil.
Einklappen und erneutes Öffnen erhalten den Ergebnisstand; der Schieberegler
verändert die Höhe auch per Tastatur. Zeichenfläche und Ergebnisbereich wurden
gemeinsam visuell geprüft und als Screenshot dokumentiert.

## Integration nach Review von PR #40

Auf `master`-Stand `8287084` (einschließlich Parametereingabe aus PR #39) rebasiert.
Der Tab reicht sämtliche Editor-Props einschließlich der Speicheraktionen weiter
und ergänzt den Ergebnisbereich. Ein App-Integrationstest ändert eine gemeinsame
Komponentenrate sowie t und τ über die echte Oberfläche, prüft die Veraltet-Markierung,
die neu berechnete Tabelle und den Projekt-Export. Alle 218 Tests, Typecheck,
Produktionsbuild und Oxlint bestehen auf diesem integrierten Stand.
Auch Exponentialwerte verwenden nun ein Dezimalkomma, z. B. `1,25000e-8`.
