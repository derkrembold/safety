# Cleanup: Dauertexte durch Tooltips ersetzt bzw. entfernt (Issue #51)

Agent: Claude Code.

Sechs dauerhaft sichtbare Erklärtexte entfernt bzw. als nativen `title`-Tooltip
angeboten, konsistent mit dem bereits vorhandenen Tooltip-Muster bei den Elementen in
der rechten Seitenleiste (`title="In das Feld ziehen oder doppelklicken"`). Entscheidung
von Derk: nativer `title`-Tooltip, kein eigenes Hilfe-Symbol/Popup.

- **Ergebnisbereich** (`ResultsPanel.tsx`): die Erklärung zu „Berechnen“ steht jetzt als
  `title` am Berechnen/Neu-berechnen-Button statt dauerhaft im (vor der ersten Berechnung
  sonst leeren) Ergebnisbereich.
- **Hinweiszeile zwischen Elementfeld und Ergebnisbereich** (`FehlerbaumEditor.tsx`,
  `.ft-hints`): ganz entfernt. Die vollständige Tastenkürzel-Übersicht aus #20 (über „?“
  bzw. die Befehlspalette) deckt das bereits ab.
- **Komponentenfeld** (`ParameterPanels.tsx`, `ComponentParameters`): drei Sätze als
  `title` verlagert — an der Identitätsanzeige ("Änderungen gelten für alle Vorkommen…"),
  am Ausfallrate-Feld ("…als λ_DU für PFDavg verwendet") und am Reparaturrate-Feld ("Ohne
  Reparaturrate kann die Verfügbarkeit nicht berechnet werden"). `Field` bekommt dafür
  eine neue, optionale `title`-Eigenschaft, die ans `<label>` durchgereicht wird.
- **Projektparameter** (`ParameterPanels.tsx`, `ProjectParameterPanel`): der Satz zu
  Stunden/Tausendertrennzeichen steht jetzt als `title` an der Überschrift
  "Projektparameter".

Keine sonstige Verhaltensänderung; alle betroffenen Formulare, Validierungen und
Berechnungen bleiben unverändert.

## Verifikation am 22. November 2026

271 Tests in 27 Testdateien bestanden (vier neue Tests: je einer für die drei
Komponentenfeld-Sätze plus Identität, einer für die Projektparameter-Überschrift, einer
für den Berechnen-Button, einer für die entfernte Hinweiszeile; die Hinweiszeile-Probe
per Revert bestätigt, dass sie aus dem richtigen Grund fehlschlägt). TypeScript-Typecheck,
Vite-Produktionsbuild und Oxlint erfolgreich.

Kein manueller Browsertest — kein Browser-Tooling in dieser Session verfügbar. Bitte vor
dem Merge insbesondere prüfen, dass die `title`-Tooltips beim Hover tatsächlich erscheinen
(reines CSS/HTML-Attribut, sollte nativ funktionieren, aber nicht selbst im Browser
geprüft).
