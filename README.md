# Media Duplikat Finder

Portable Windows-App zum Finden doppelter Filme und Serienfolgen.

## Funktionen

- Zwei oder mehr Ordner auswählen
- Rekursiver Scan typischer Videoformate
- Smarte Erkennung fast gleicher Film- und Seriennamen
- Serienansicht mit Staffeln, Folgen und ausklappbaren Videodateien
- Vorschaubilder pro Videodatei mit Fallback, wenn Windows kein Thumbnail liefert
- Schneller Teil-Fingerprint großer Videodateien
- Trefferstufen: Sicher gleich, Wahrscheinlich gleich, Möglicher Treffer
- Behalten-Vorschlag nach bevorzugtem Ordner, Qualität, Größe und Datum
- Pro Datei markieren, löschen oder als falsch erkannt ausblenden
- Passende Medienordner manuell oder automatisch markieren und löschen
- Gruppen komplett als falsch erkannt ausblenden und später wiederherstellen
- Ordner ohne erkannte Videos als eigene Trefferabteilung prüfen und löschen
- Verlauf der zuletzt gelöschten Dateien und Ordner
- Filter oben nach Ordner, Video-Typen oder eigener Auswahl
- Einklappbare Ordner-, Staffel-, Folgen- und Trefferbereiche
- Sicheres Löschen über Windows-Papierkorb oder optional endgültiges Löschen mit Bestätigung
- Einstellungen für Treffer-Strenge, Maskottchen und Animationen
- CSV-Export der markierten Duplikate

## Entwicklung

```powershell
npm install
npm run dev
```

## Tests und Build

```powershell
npm test
npm run build
npm run dist
```

Die portable EXE wird nach `release/Media-Duplikat-Finder-Portable-1.0.0.exe` gebaut.
Der Installer wird nach `release/Media-Duplikat-Finder-Setup-1.0.0.exe` gebaut.
