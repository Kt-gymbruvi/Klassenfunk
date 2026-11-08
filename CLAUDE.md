# Klassenfunk – Projektregeln

Klassenfunk ist eine Live-Abstimmungs-App für den Schulunterricht (Wortwolke, Umfrage, Skala, Fragen der Klasse …) – eigener Name, eigenes Design. Schwesterprojekt von Quizzo (`../Quizzo`), aber eine eigene Anwendung.

## Technik
- Statische Web-App: Vite + React + TypeScript + Tailwind CSS v4.
- Hosting: GitHub Pages unter https://kt-gymbruvi.github.io/Klassenfunk/ (Basis-Pfad `/Klassenfunk/`).
- Deployment automatisch per GitHub Actions (`.github/workflows/deploy.yml`) bei Push auf `main`.
- Daten, Lehrkraft-Login und Echtzeit über dieselbe Supabase-Datenbank wie Quizzo (Region Frankfurt). Alle Klassenfunk-Tabellen und -Funktionen beginnen mit `kf_`. Kein eigener Server.
- Lehrkraft-Konten sind dieselben wie bei Quizzo (nur eingeladene Lehrkräfte, E-Mail und Passwort).

## Oberfläche
- Oberfläche komplett auf Deutsch.
- Schüleransicht (`/mitmachen`): für Handys optimiert (Hochformat, große Tippflächen).
- Lehrkraft-Ansicht (`/leiten/sitzung/:id`): für iPad im Querformat am Beamer, große Schrift.
- Kein Scrollen in der Sitzung: `<Einpassen>` (`src/einpassen.tsx`) verkleinert gleichmäßig, was nicht passt.
- Design: Petrol und Koralle (`funk-petrol` / `funk-koralle` im `@theme`-Block von `src/index.css`).
- Jede Ansicht hat oben links einen Knopf „🏠 Homepage“ zur Startseite https://kt-gymbruvi.github.io/ (`ZurHomepage` in `src/components.tsx`).
- Routing per HashRouter (`…/Klassenfunk/#/mitmachen?pin=123456`).
- Supabase-URL und publishable-Schlüssel stehen in `.env.production` (eingecheckt) bzw. `.env.local`; Vorlage: `.env.example`.

## Datenbank
- Änderungen als SQL-Dateien `supabase/migrations/kf_NNN_*.sql`; die Lehrkraft führt sie im SQL Editor aus (Anleitung: `supabase/EINRICHTUNG.md`).
- Präsentationen (`kf_praesentationen`, `kf_folien`) gehören der Lehrkraft (RLS über `besitzer_id`). Folientypen und ihr JSON-Format: `src/lib/folien.ts`, geprüft von `kf_folie_gueltig()`.
- Live-Sitzungen: `kf_sitzungen` (PIN, Folien-Schnappschuss), `kf_teilnehmer` (nur Kennung + Token), `kf_antworten`, `kf_fragen`, `kf_stimmen`.
- Schüler haben keinen Tabellenzugriff; sie nutzen nur `kf_beitreten`, `kf_zustand`, `kf_antworten`, `kf_frage_stellen`, `kf_frage_stimmen` (security definer, Teilnehmer-Token).
- Info-Folien können ein Medium haben (`inhalt.medium`: hochgeladenes Bild oder YouTube-Video, geprüft von `kf_medium_gueltig()`, Migration kf_002). Bilder liegen im eigenen Storage-Bucket `klassenfunk-medien` (öffentlich lesbar, Schreiben nur im Ordner `<auth.uid()>/`) – bewusst nicht im Quizzo-Bucket, weil Quizzo dort unbenutzte Dateien löscht. Unbenutzte Bilder (älter als 24 h) löscht `raeumeBilderAuf()` (`src/lib/medien.ts`). Medien nur am Beamer, nie auf den Handys; YouTube über youtube-nocookie.com.
- Reaktionen und Tempo-Barometer laufen nur über den Echtzeit-Kanal (`klassenfunk-<sitzung>`, broadcast) und werden nirgends gespeichert.
- Sitzungen werden beim Beenden gelöscht; was älter als 6 Stunden ist, räumt `kf_aufraeumen()` automatisch weg.
- Tests: Supabase wird durch eine Attrappe ersetzt (`src/test/fakeSupabase.ts`); SQL wird mit PGlite gegen einen Supabase-Nachbau getestet (`src/test/sql/`), inkl. RLS und Rechten von `anon`/`authenticated`.

## Datenschutz
- Schüler brauchen kein Konto und geben keinen Namen ein – nur die PIN. Alle Antworten sind anonym.
- Keine Klarnamen, keine E-Mail-Adressen von Schülern erfassen oder speichern.
- Antworten und Fragen werden nach Sitzungsende gelöscht (spätestens nach 6 Stunden).
- Auf dem Schülergerät wird nur die Teilnahme (Kennung und Token, höchstens 6 Stunden) im localStorage gemerkt.
- Dauerhaft gespeichert werden nur die Präsentationen der Lehrkraft.

## Sicherheit
- Im Code steht nur der öffentliche Supabase-Schlüssel (publishable / anon).
- Niemals den secret- oder service_role-Schlüssel verwenden – weder im Code, noch in Workflows, noch in `.env`-Dateien.
- Alle Tabellen haben Row Level Security (RLS) aktiviert, mit expliziten Policies.

## Arbeitsweise
- Nach jeder Etappe: Tests ausführen (`npm test`, `npm run build` – enthält die TypeScript-Prüfung) und zusammenfassen, was getestet wurde und was nicht.
- Fahrplan und Stand: `FAHRPLAN.md`.
- Nichts veröffentlichen (Push auf `main`, Deployment, Supabase-Änderungen an Produktivdaten) und nichts löschen ohne ausdrückliche Zustimmung der Lehrkraft (Projektinhaber).
