# Projektstand – Klassenfunk

Stand: 10.11.2026 · live unter https://kt-gymbruvi.github.io/Klassenfunk/ · `main` = `origin/main` (`3d76924`)
Tests: 2 Testdateien, 32 Tests grün (`npm test`); Build grün. SQL `kf_001` und `kf_002` in Produktion ausgeführt (lesend geprüft).

## Implementiert (alles veröffentlicht)
- **Startseite** mit „Mitmachen“ und „Präsentieren“; Knopf „🏠 Homepage“ (kt-gymbruvi.github.io) in jeder Ansicht oben links.
- **Lehrkraft:** Anmeldung mit Quizzo-Konto, Passwort ändern; Präsentationen anlegen, bearbeiten, kopieren, löschen.
- **Folientypen:** Wortwolke (1–3 Begriffe), Umfrage (einfach/mehrfach), Offene Frage, Skala 1–5, Rangfolge, 100 Punkte verteilen, 2×2-Raster, Fragen der Klasse (mit 👍, beantwortet/ausblenden), Info-Folie (Text + optional Bild oder YouTube-Video, am Beamer je eine Hälfte).
- **Sitzung am Beamer:** PIN + QR, Abstimmung öffnen/schließen, Ergebnisse zeigen/verbergen, unpassende Antworten ausblenden, Folien vor/zurück, Beenden löscht alles.
- **Handy:** Beitritt nur mit PIN (Teilnahme 6 h im localStorage), Antworten ändern, Reaktionen (Emojis) und Tempo-/Verständnis-Barometer über Realtime-Broadcast (nicht gespeichert). Medien werden auf dem Handy nicht gezeigt.
- **Medien:** Bilder im Bucket `klassenfunk-medien` (auf 1920 px verkleinert, WebP), unbenutzte Bilder > 24 h löscht `raeumeBilderAuf()`.

## Struktur
```
src/App.tsx, main.tsx, components.tsx, einpassen.tsx, index.css
src/pages/            Startseite.tsx, Mitmachen.tsx (Handy)
src/pages/lehrkraft/  Anmelden, Liste, Editor, MedienFeld, Praesentieren (Beamer), Passwort
src/ansicht/          Ergebnis.tsx
src/lib/              daten.ts, folien.ts, medien.ts, auth.tsx, supabase.ts, schluessel.ts
src/test/             app.test.tsx (UI), fakeSupabase.ts, sql/ (PGlite)
supabase/             EINRICHTUNG.md, migrations/kf_001_klassenfunk.sql, kf_002_medien.sql
```

## Bekannte Probleme / offen
- Noch keine echte Sitzung mit mehreren Handys gegen die Live-Datenbank erprobt; insbesondere Reaktionen/Barometer (Realtime) nur ohne echte Gegenstelle getestet.
- Bild-Upload in den Produktions-Speicher noch nicht ausprobiert (Bucket existiert).
- Einladungs- und „Passwort vergessen“-Mails führen zu Quizzo (gleiches Konto); eigener SMTP-Server in Supabase fehlt (siehe Quizzo).

## Nächste Schritte (priorisiert)
1. Probelauf im Unterricht: iPad am Beamer, 2–3 Handys, alle Folientypen, Reaktionen, Barometer, Bild/YouTube.
2. Ideen aus `FAHRPLAN.md` (nicht begonnen): Bilder auch auf Abstimmungsfolien, Quiz-Folie mit richtiger Antwort, Ergebnisse als PDF/Bild exportieren, Präsentation per Link teilen.
