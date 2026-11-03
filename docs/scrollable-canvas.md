# Scrollbare Fehlerbaum-Zeichenfläche (Issue #22)

Der sichtbare Bereich bleibt ein Viewport mit nativen, bedarfsabhängigen horizontalen
und vertikalen Scrollbars (`overflow: auto`). Toolbar, Sidebar und Hinweise scrollen
nicht mit. Darin liegt eine eigene Zeichenfläche, die mindestens so groß wie der
Viewport ist und mit dem Inhalt wächst.

Die Ausdehnung berücksichtigt die tatsächlichen SVG-Grenzen einschließlich
Beschriftungen und Anschlussports sowie die aktive Umbenennungseingabe. Ein
24-Pixel-Rand hält Stubs am Modellursprung erreichbar. Ohne SVG-Layoutmessung
(z. B. in jsdom) wird ein konservativer Textbreiten-Ersatz verwendet. Font-Ladeereignisse
lösen eine erneute Messung aus.

Modellkoordinaten werden nicht an die Fenstergröße angepasst. Fensterverkleinerung,
Scrollen und Reiterwechsel verschieben keine Knoten. Beim Einfügen und Verschieben
bleiben nur negative Positionen ausgeschlossen. Der rechte und untere Rand sind
keine Modellgrenzen mehr.

Zeigerkoordinaten werden über das aktuelle Client-Rechteck der **inneren** Fläche
in Modellkoordinaten umgerechnet. Dieses Rechteck enthält den Scrollversatz bereits;
ein zusätzliches Addieren von scrollLeft/scrollTop wäre falsch. Scrollen während
eines laufenden Verschiebe-/Verbindungsvorgangs aktualisiert die aktuelle Position
bzw. Vorschau auch ohne erneutes pointermove. Escape, pointercancel und Unmount
beenden weiterhin das Tracking. Die Umbenennungseingabe liegt auf derselben inneren
Fläche wie die SVG-Elemente. Nur Modellpositionen werden im Projekt gespeichert;
Scrollpositionen sind kein Teil des Dateiformats.

## Automatische Tests

`npm test` umfasst Tests für:

- kleine sowie horizontal/vertikal wachsende Flächen und Beschriftungsgrenzen;
- Einfügen nach horizontalem und vertikalem Scrollen;
- Scrollen während einer Verschiebung und Verbindungsvorschau;
- erfolgreiche Verbindung und korrekt positionierte Umbenennung;
- unveränderte Positionen beim Resize und erneuten Öffnen des Editors;
- Datei-Roundtrip gescrollt bearbeiteter Modellpositionen;
- bestehendes Abbruchverhalten für Escape, pointercancel und Unmount.

Die bisherigen Tests für das Zurückschieben in einen festen Viewport wurden durch
Tests für die neue, mitwachsende Fläche ersetzt.

## Browserprüfung am 03.11.2026

Zusätzlich zur jsdom-Testsuite wurde die laufende App mit Playwright in installiertem
Headless-Chromium geprüft. Die Browser-Werkzeuge wurden ausschließlich in einem
separaten temporären Ordner installiert; das Projekt hat keine neue Abhängigkeit.

Bei 1280 × 900 Fenstergröße betrug der sichtbare Zeichenbereich 988 × 678 Pixel:

| Fall | Innere Fläche | Ergebnis |
| --- | --- | --- |
| Kleiner Baum | 988 × 678 | Kein Überlauf |
| Breiter Baum | 1666 × 678 | Nur horizontaler Überlauf |
| Hoher Baum | 988 × 1664 | Nur vertikaler Überlauf |
| Ziehen über rechten/unteren Viewportrand | 1303 × 762 | Fläche wächst in beiden Achsen |

Außerdem erfolgreich geprüft:

1. Projekt mit Knoten bei (1500, 1400) und (1500, 1560) importieren und beide Achsen scrollen.
2. Eine Verbindung mit echter Mausbedienung zwischen den sichtbaren Stubs ziehen.
3. Ein UND-Element per echtem HTML-Drag-and-Drop aus der Sidebar in den gescrollten Bereich einfügen; Position mit der erwarteten Modellkoordinate vergleichen.
4. Das Element umbenennen; Eingabe und Beschriftung bleiben korrekt zugeordnet.
5. Fenster auf 900 × 700 verkleinern und Reiter wechseln; Modellpositionen bleiben unverändert.
6. Echten JSON-Dateidownload importieren; Positionen, Beschriftungen und Verbindung bleiben erhalten.
7. Knoten über den Viewportrand ziehen; der restliche Baum bleibt unverändert und das verschobene Element ist durch Scrollen erreichbar.

Keine JavaScript-Seitenfehler während dieser Browserprüfung. Scrollbars werden je
nach Browser-/Betriebssystemeinstellung als klassische oder automatisch ausgeblendete
Overlay-Scrollbars dargestellt. Zoom, Minimap und automatisches Layout sind nicht
Teil dieser Änderung.
