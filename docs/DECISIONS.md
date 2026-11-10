# Entscheidungen – Klassenfunk

Neue Entscheidungen oben anfügen: Datum, Entscheidung, Grund, verworfene Alternativen.

## 2026-11-08 – Info-Folie: Text und Medium je eine Hälfte
- Auf Wunsch der Lehrkraft immer zwei gleich große Spalten (CSS-Grid `minmax(0,1fr)` ×2), Bild mit `object-contain` eingepasst, nie beschnitten. Ohne Text füllt das Medium die ganze Breite.
- Verworfen: Flexbox mit `flex-1` – das Innenabstand-Polster des Textfelds machte die Spalten ungleich breit.

## 2026-11-08 – Eigener Speicher-Bucket `klassenfunk-medien`
- Nicht der Quizzo-Bucket: Quizzos `raeumeMedienAuf()` löscht im Ordner der Lehrkraft alles, was in keiner Quizfrage vorkommt – Klassenfunk-Bilder wären verloren.
- Aufräumen nur für Bilder älter als 24 h, damit offene Editoren und laufende Sitzungen (max. 6 h) nicht kaputtgehen.
- Medien nur am Beamer; YouTube über youtube-nocookie (Cookies erst beim Abspielen, nur Lehrkraft-Gerät). `kf_zustand` liefert das Medium zwar mit, das Handy zeigt es aber nicht an.

## 2026-11-08 – Homepage-Knopf in jeder Ansicht
- Als Element im Kopfbereich bzw. absolut oben links je Seite (`ZurHomepage`), nicht als global fixiertes Element – das hätte Logo, Steuerung oder Reaktionsleiste überdeckt.

## 2026-11-07 – Eigene App statt Teil von Quizzo
- Wunsch der Lehrkraft: Mentimeter-ähnliche Abstimmungen als eigene Anwendung mit eigenem Namen, Design (Petrol/Koralle) und Editor.
- Gleiche Supabase-Datenbank und Konten wie Quizzo; alle Tabellen/Funktionen mit Präfix `kf_`, damit nichts mit Quizzo kollidiert.
- Code wird nicht geteilt, sondern Muster übernommen (Einpassen, Test-Attrappe, PGlite-Nachbau) – die Repos bleiben unabhängig.

## Datenschutz-Architektur
- Schüler geben **keinen Namen** ein, nur die PIN; Teilnehmer = Kennung + Token. Kein Tabellenzugriff, nur security-definer-Funktionen (`kf_beitreten`, `kf_zustand`, `kf_antworten`, `kf_frage_stellen`, `kf_frage_stimmen`).
- Folien werden beim Start als Schnappschuss in die Sitzung kopiert; Sitzungsdaten werden beim Beenden bzw. nach 6 h (`kf_aufraeumen()`) gelöscht.
- **Reaktionen und Barometer nur über Realtime-Broadcast** (`klassenfunk-<sitzung>`), nie in der Datenbank – flüchtige Stimmungen brauchen keine Speicherung.

## Technik
- Stack und Hosting wie Quizzo (Vite/React/TS/Tailwind, GitHub Pages per Actions, HashRouter), damit dieselben Werkzeuge und Tests funktionieren.
- Handy fragt den Zustand alle 2 s ab und reagiert zusätzlich auf „aktualisieren“-Broadcasts der Lehrkraft; Polling bleibt als Rückfallebene, falls Realtime ausfällt.
- Kein Scrollen in der Sitzung: `<Einpassen>` verkleinert gleichmäßig; Medien liegen absolut positioniert in einem `flex-1`-Bereich, damit ihre Bildgröße nicht die ganze Folie verkleinert.
