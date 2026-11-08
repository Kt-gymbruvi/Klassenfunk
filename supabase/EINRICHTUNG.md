# Supabase für Klassenfunk einrichten

Klassenfunk nutzt dieselbe Supabase-Datenbank und dieselben Lehrkraft-Konten wie Quizzo. Der secret-Schlüssel wird nicht gebraucht.

## 1. Tabellen und Funktionen anlegen
1. Supabase-Dashboard → **SQL Editor** → **New query**.
2. Den kompletten Inhalt von [`migrations/kf_001_klassenfunk.sql`](migrations/kf_001_klassenfunk.sql) einfügen.
3. **Run** klicken. Erwartet: „Success. No rows returned“.

Danach gibt es im **Table Editor** die Tabellen `kf_praesentationen`, `kf_folien`, `kf_sitzungen`, `kf_teilnehmer`, `kf_antworten`, `kf_fragen` und `kf_stimmen` – alle mit „RLS enabled“. Quizzo-Tabellen werden nicht verändert.

## 1b. Bilder und Videos auf Info-Folien
Genauso den Inhalt von [`migrations/kf_002_medien.sql`](migrations/kf_002_medien.sql) ausführen. Erwartet: „Success. No rows returned“.
Danach gibt es unter **Storage** den Bucket `klassenfunk-medien` (öffentlich). Quizzo-Bilder werden nicht verändert.

## 2. Adresse erlauben (optional)
**Authentication → URL Configuration → Redirect URLs** → Add URL: `https://kt-gymbruvi.github.io/Klassenfunk/`

Einladungs- und „Passwort vergessen“-Mails führen weiterhin zu Quizzo (gleiches Konto) – danach kann man sich in Klassenfunk mit demselben Passwort anmelden.

## 3. Echtzeit
Reaktionen und Tempo-Barometer laufen über Realtime-Broadcast. Das ist im Projekt bereits aktiv (Quizzo-Buzzer nutzt es auch); es wird nichts gespeichert.
