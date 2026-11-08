// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite'
import { ANONYM, LEHRKRAFT_A, LEHRKRAFT_B, als, lehrkraft, neueDatenbank, rpc } from './datenbank.ts'

const A = lehrkraft(LEHRKRAFT_A)
const B = lehrkraft(LEHRKRAFT_B)
const json = (x: unknown) => JSON.stringify(x)

const FOLIEN = [
  { typ: 'wortwolke', text: 'Was fällt dir zu Evolution ein?', inhalt: { woerter: 2 } },
  { typ: 'auswahl', text: 'Welches Thema als Nächstes?', inhalt: { optionen: ['Genetik', 'Ökologie', 'Zelle'], mehrfach: false } },
  { typ: 'skala', text: 'Wie sicher fühlst du dich?', inhalt: { aussagen: ['Mitose', 'Meiose'], links: 'unsicher', rechts: 'sicher' } },
  { typ: 'rangfolge', text: 'Was ist am wichtigsten?', inhalt: { elemente: ['Schlaf', 'Sport', 'Ernährung'] } },
  { typ: 'punkte', text: 'Verteile 100 Punkte', inhalt: { optionen: ['A', 'B'] } },
  { typ: 'raster', text: 'Aufwand und Nutzen', inhalt: { elemente: ['Karteikarten'], x: ['wenig Aufwand', 'viel Aufwand'], y: ['wenig Nutzen', 'viel Nutzen'] } },
  { typ: 'fragen', text: 'Eure Fragen zur Klausur', inhalt: {} },
  { typ: 'offen', text: 'Was nimmst du mit?', inhalt: { max_zeichen: 140, mehrfach: true } },
  { typ: 'info', text: 'Danke!', inhalt: { text: 'Bis morgen' } },
]

type Beitritt = { sitzung_id: string; teilnehmer_id: string; token: string }
type Ergebnis = { folie_nr: number; teilnehmer: number; abgestimmt: number; antworten: { id: number; antwort: unknown; versteckt: boolean }[]; fragen: { id: number; text: string; stimmen: number; versteckt: boolean }[] }

describe('Klassenfunk-Datenbank', () => {
  let db: PGlite
  let praes: string

  beforeAll(async () => {
    db = await neueDatenbank()
    praes = await rpc<string>(db, A, 'kf_praesentation_speichern', [null, 'Biologie 10', json(FOLIEN)])
  }, 60_000)

  describe('Präsentationen', () => {
    it('Lehrkraft sieht nur eigene, Schüler gar nichts', async () => {
      expect(await als(db, A, 'select count(*)::int as n from public.kf_folien')).toEqual([{ n: FOLIEN.length }])
      expect(await als(db, B, 'select * from public.kf_praesentationen')).toEqual([])
      await expect(als(db, ANONYM, 'select * from public.kf_praesentationen')).rejects.toThrow(/permission denied/)
      await expect(rpc(db, B, 'kf_praesentation_speichern', [praes, 'Gehackt', json(FOLIEN)])).rejects.toThrow('nicht gefunden')
    })
    it('ungültige Folien lehnt die Datenbank ab', async () => {
      for (const f of [
        { typ: 'auswahl', text: 'x', inhalt: { optionen: ['nur eine'], mehrfach: false } },
        { typ: 'wortwolke', text: 'x', inhalt: { woerter: 5 } },
        { typ: 'skala', text: 'x', inhalt: { aussagen: [], links: 'a', rechts: 'b' } },
        { typ: 'unbekannt', text: 'x', inhalt: {} },
      ]) {
        await expect(rpc(db, A, 'kf_praesentation_speichern', [null, 'Kaputt', json([f])])).rejects.toThrow(/check/)
      }
    })
  })

  describe('Live-Sitzung', () => {
    let sitzung: { id: string; pin: string }
    let s1: Beitritt
    let s2: Beitritt
    const antworte = (b: Beitritt, nr: number, a: unknown) => rpc(db, ANONYM, 'kf_antworten', [b.teilnehmer_id, b.token, nr, json(a)])
    const steuern = (nr: number, offen = true, sichtbar = true) => rpc(db, A, 'kf_sitzung_steuern', [sitzung.id, nr, offen, sichtbar])
    const ergebnis = () => rpc<Ergebnis>(db, A, 'kf_ergebnisse', [sitzung.id])

    it('Sitzung starten, anonym beitreten (nur PIN)', async () => {
      await expect(rpc(db, B, 'kf_sitzung_starten', [praes])).rejects.toThrow('nicht gefunden')
      sitzung = await rpc(db, A, 'kf_sitzung_starten', [praes])
      expect(sitzung.pin).toMatch(/^\d{6}$/)
      s1 = await rpc<Beitritt>(db, ANONYM, 'kf_beitreten', [sitzung.pin])
      s2 = await rpc<Beitritt>(db, ANONYM, 'kf_beitreten', [` ${sitzung.pin} `])
      await expect(rpc(db, ANONYM, 'kf_beitreten', ['999999'])).rejects.toThrow('läuft gerade nichts')
      expect((await ergebnis()).teilnehmer).toBe(2)
      // keine Spalte für Namen – Teilnehmer sind anonym
      expect(Object.keys((await db.query('select * from public.kf_teilnehmer limit 1')).rows[0] as object).sort()).toEqual(['beigetreten', 'id', 'sitzung_id', 'token'])
    })

    it('Wortwolke: mehrere Wörter pro Person bis zum Limit, ausblenden', async () => {
      await antworte(s1, 0, 'Selektion')
      await antworte(s1, 0, ' Mutation ')
      await expect(antworte(s1, 0, 'Drift')).rejects.toThrow('schon alles')
      await antworte(s2, 0, 'Selektion')
      const e = await ergebnis()
      expect(e.antworten.map((a) => a.antwort)).toEqual(['Selektion', 'Mutation', 'Selektion'])
      expect(e.abgestimmt).toBe(2)
      await expect(rpc(db, B, 'kf_antwort_ausblenden', [e.antworten[1].id, true])).rejects.toThrow('nicht gefunden')
      await rpc(db, A, 'kf_antwort_ausblenden', [e.antworten[1].id, true])
      expect((await ergebnis()).antworten[1].versteckt).toBe(true)
    })

    it('nur die aktuelle Folie, nur bei offener Abstimmung; Antwort ändern ersetzt sie', async () => {
      await expect(antworte(s1, 1, [0])).rejects.toThrow('nicht mehr dran')
      await steuern(1)
      await antworte(s1, 1, [0])
      await antworte(s1, 1, [2]) // umentschieden
      await expect(antworte(s1, 1, [0, 1])).rejects.toThrow('passt nicht') // nur eine Antwort erlaubt
      await expect(antworte(s1, 1, [7])).rejects.toThrow('passt nicht')
      expect((await ergebnis()).antworten.map((a) => a.antwort)).toEqual([[2]])
      await steuern(1, false)
      await expect(antworte(s2, 1, [1])).rejects.toThrow('geschlossen')
    })

    it('Skala, Rangfolge, 100 Punkte, Raster werden geprüft', async () => {
      await steuern(2)
      await antworte(s1, 2, [4, 2])
      await expect(antworte(s2, 2, [6, 1])).rejects.toThrow('passt nicht')
      await steuern(3)
      await antworte(s1, 3, [2, 0, 1])
      await expect(antworte(s2, 3, [0, 0, 1])).rejects.toThrow('passt nicht')
      await steuern(4)
      await antworte(s1, 4, [70, 30])
      await expect(antworte(s2, 4, [70, 40])).rejects.toThrow('passt nicht')
      await steuern(5)
      await antworte(s1, 5, [[3, 8.5]])
      await expect(antworte(s2, 5, [[11, 2]])).rejects.toThrow('passt nicht')
    })

    it('Fragen der Klasse: stellen, Daumen (nicht für eigene), ausblenden, Handys sehen keine versteckten', async () => {
      await steuern(6)
      await rpc(db, ANONYM, 'kf_frage_stellen', [s1.teilnehmer_id, s1.token, 'Kommt Meiose dran?'])
      const [f] = (await ergebnis()).fragen
      await expect(rpc(db, ANONYM, 'kf_frage_stimmen', [s1.teilnehmer_id, s1.token, f.id])).rejects.toThrow('eigene Frage')
      expect(await rpc(db, ANONYM, 'kf_frage_stimmen', [s2.teilnehmer_id, s2.token, f.id])).toEqual({ gestimmt: true })
      expect((await ergebnis()).fragen[0].stimmen).toBe(1)
      expect(await rpc(db, ANONYM, 'kf_frage_stimmen', [s2.teilnehmer_id, s2.token, f.id])).toEqual({ gestimmt: false })
      const zustand = await rpc<{ fragen: { text: string; von_mir: boolean }[] }>(db, ANONYM, 'kf_zustand', [s1.teilnehmer_id, s1.token])
      expect(zustand.fragen).toEqual([expect.objectContaining({ text: 'Kommt Meiose dran?', von_mir: true })])
      await rpc(db, A, 'kf_frage_markieren', [f.id, true, false])
      expect((await rpc<{ fragen: unknown[] }>(db, ANONYM, 'kf_zustand', [s2.teilnehmer_id, s2.token])).fragen).toEqual([])
    })

    it('offene Frage mit mehreren Antworten; Info-Folie nimmt nichts an', async () => {
      await steuern(7)
      await antworte(s1, 7, 'Mehr üben')
      await expect(antworte(s1, 7, 'x'.repeat(141))).rejects.toThrow('passt nicht')
      await steuern(8)
      await expect(antworte(s1, 8, 'hallo')).rejects.toThrow('passt nicht')
    })

    it('Rechte: Schüler keine Tabellen, fremde Lehrkraft nichts; Beenden löscht alles', async () => {
      for (const t of ['kf_sitzungen', 'kf_teilnehmer', 'kf_antworten', 'kf_fragen', 'kf_stimmen']) {
        await expect(als(db, ANONYM, `select * from public.${t}`)).rejects.toThrow(/permission denied/)
      }
      await expect(als(db, A, 'select token from public.kf_teilnehmer')).rejects.toThrow(/permission denied/)
      expect(await rpc(db, B, 'kf_ergebnisse', [sitzung.id])).toBeNull()
      await expect(rpc(db, B, 'kf_sitzung_steuern', [sitzung.id, 0, true, true])).rejects.toThrow('nicht gefunden')
      for (const f of ['kf_aufraeumen', 'kf_antwort_gueltig', 'kf_folie']) {
        const [{ n }] = await als<{ n: boolean }>(db, A, `select bool_or(has_function_privilege('anon', p.oid, 'execute')) as n from pg_proc p where proname = $1`, [f])
        expect(n).toBe(false)
      }
      await als(db, A, 'delete from public.kf_sitzungen where id = $1', [sitzung.id])
      const rest = await db.query<{ n: number }>('select (select count(*) from public.kf_teilnehmer) + (select count(*) from public.kf_antworten) + (select count(*) from public.kf_fragen) as n')
      expect(Number(rest.rows[0].n)).toBe(0)
      expect(await rpc(db, ANONYM, 'kf_zustand', [s1.teilnehmer_id, s1.token])).toBeNull()
    })

    it('alte Sitzungen räumt das System nach 6 Stunden weg', async () => {
      const alt = await rpc<{ id: string; pin: string }>(db, A, 'kf_sitzung_starten', [praes])
      await db.query(`update public.kf_sitzungen set erstellt_am = now() - interval '7 hours' where id = $1`, [alt.id])
      await expect(rpc(db, ANONYM, 'kf_beitreten', [alt.pin])).rejects.toThrow('läuft gerade nichts')
    })
  })

  describe('Info-Folie mit Bild oder YouTube-Video (kf_002)', () => {
    const info = (medium: unknown) => [{ typ: 'info', text: 'Schau mal', inhalt: { text: '', medium } }]
    const BILD_PFAD = `${LEHRKRAFT_A}/11111111-2222-4333-8444-555555555555.webp`

    it('gültige Medien werden gespeichert', async () => {
      for (const m of [
        { art: 'bild', url: `https://x.supabase.co/storage/v1/object/public/klassenfunk-medien/${BILD_PFAD}`, pfad: BILD_PFAD },
        { art: 'bild', url: 'https://example.org/zelle.png' },
        { art: 'youtube', id: 'dQw4w9WgXcQ' },
        { art: 'youtube', id: 'dQw4w9WgXcQ', start: 83 },
      ]) {
        const id = await rpc<string>(db, A, 'kf_praesentation_speichern', [null, 'Mit Medium', json(info(m))])
        const [{ inhalt }] = await als<{ inhalt: { medium: unknown } }>(db, A, 'select inhalt from public.kf_folien where praesentation_id = $1', [id])
        expect(inhalt.medium).toEqual(m)
      }
    })

    it('ungültige Medien lehnt die Datenbank ab', async () => {
      for (const m of [
        { art: 'bild', url: 'http://unsicher.de/bild.png' },
        { art: 'bild', url: 'javascript:alert(1)' },
        { art: 'bild', url: 'https://ok.de/a.png', pfad: '../fremd/datei.png' },
        { art: 'youtube', id: 'zu-kurz' },
        { art: 'youtube', id: 'dQw4w9WgXcQ', start: -5 },
        { art: 'youtube', id: 'dQw4w9WgXcQ', start: '10' },
        { art: 'youtube', id: 'dQw4w9WgXcQ', extra: 1, start: 1 },
        { art: 'video', url: 'https://ok.de/a.mp4' },
        'https://ok.de/a.png',
      ]) {
        await expect(rpc(db, A, 'kf_praesentation_speichern', [null, 'Kaputt', json(info(m))])).rejects.toThrow(/check/)
      }
      // Medium nur auf Info-Folien: bei anderen Typen bleibt alles wie bisher
      expect(await rpc(db, A, 'kf_praesentation_speichern', [null, 'Ohne', json([{ typ: 'info', text: 'x', inhalt: { text: 'y' } }])])).toBeTruthy()
    })

    it('Bilder-Speicher: jede Lehrkraft nur im eigenen Ordner, Schüler gar nicht', async () => {
      const [bucket] = await db.query<{ public: boolean; allowed_mime_types: string[] }>("select public, allowed_mime_types from storage.buckets where id = 'klassenfunk-medien'").then((r) => r.rows)
      expect(bucket.public).toBe(true)
      expect(bucket.allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      const lege = (wer: typeof A, name: string) => als(db, wer, "insert into storage.objects (bucket_id, name) values ('klassenfunk-medien', $1)", [name])
      await lege(A, BILD_PFAD)
      await expect(lege(B, BILD_PFAD.replace('5555', '6666'))).rejects.toThrow(/row-level security/)
      await expect(lege(ANONYM, `${LEHRKRAFT_A}/x.png`)).rejects.toThrow(/row-level security|permission denied/)
      expect(await als(db, B, "select name from storage.objects where bucket_id = 'klassenfunk-medien'")).toEqual([])
      expect(await als(db, B, 'delete from storage.objects returning name')).toEqual([])
      expect(await als(db, A, "delete from storage.objects where bucket_id = 'klassenfunk-medien' returning name")).toEqual([{ name: BILD_PFAD }])
    })
  })
})
