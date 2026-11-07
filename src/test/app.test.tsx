import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.tsx'
import type { Folie } from '../lib/folien.ts'
import { gruppiereWoerter } from '../ansicht/Ergebnis.tsx'
import type { Ergebnisse, Zustand } from '../lib/daten.ts'
import { abfrage, eingeloggteSession, fakeSupabase, setzeFakeZurueck } from './fakeSupabase.ts'

type Args = Record<string, unknown>
const SITZUNG = '33333333-3333-4333-8333-333333333333'
const T = { sitzung_id: SITZUNG, teilnehmer_id: '44444444-4444-4444-8444-444444444444', token: 'geheim' }

const zeige = (pfad: string) =>
  render(
    <MemoryRouter initialEntries={[pfad]}>
      <App />
    </MemoryRouter>,
  )

/** rpc-Attrappe: Funktionsname → Antwort (Funktion bekommt die Argumente) */
function rpcAntworten(antworten: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>) {
  fakeSupabase.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (!(name in antworten)) return { data: null, error: { message: `unerwartet: ${name}` } }
    const a = antworten[name]
    const data = typeof a === 'function' ? (a as (x: Record<string, unknown>) => unknown)(args) : a
    if (data instanceof Error) return { data: null, error: { message: data.message } }
    return { data, error: null }
  })
}
const aufrufe = (name: string) => fakeSupabase.rpc.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>)

function zustand(folie: Folie, mehr: Partial<Zustand> = {}): Zustand {
  return { titel: 'Einstieg', folie_nr: 0, anzahl_folien: 3, folie, abstimmung_offen: true, meine: [], fragen: null, ...mehr }
}

describe('Editor', () => {
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('legt eine Präsentation mit Wortwolke und Umfrage an und speichert bereinigt', async () => {
    const user = userEvent.setup()
    rpcAntworten({ kf_praesentation_speichern: 'p1' })
    zeige('/leiten/praesentation/neu')
    await user.type(await screen.findByPlaceholderText(/Einstieg Evolution/), 'Einstieg Genetik')
    await user.type(screen.getByLabelText('Text Folie 1'), 'Was fällt dir zu DNA ein?')
    await user.click(screen.getByRole('button', { name: /Umfrage/ }))
    await user.type(screen.getByLabelText('Text Folie 2'), 'Wie sicher fühlst du dich?')
    await user.type(screen.getByLabelText('Folie 2 Antwort 1'), 'sehr')
    await user.type(screen.getByLabelText('Folie 2 Antwort 2'), '  gar   nicht ')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(aufrufe('kf_praesentation_speichern')).toHaveLength(1))
    const args = aufrufe('kf_praesentation_speichern')[0]
    expect(args.p_titel).toBe('Einstieg Genetik')
    expect(args.p_folien).toEqual([
      { typ: 'wortwolke', text: 'Was fällt dir zu DNA ein?', inhalt: { woerter: 2 } },
      { typ: 'auswahl', text: 'Wie sicher fühlst du dich?', inhalt: { optionen: ['sehr', 'gar nicht'], mehrfach: false } },
    ])
  })

  it('speichert nicht, solange etwas fehlt', async () => {
    const user = userEvent.setup()
    zeige('/leiten/praesentation/neu')
    await user.click(await screen.findByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(aufrufe('kf_praesentation_speichern')).toHaveLength(0)
  })
})

describe('Liste', () => {
  it('startet eine Sitzung und zeigt PIN und QR-Code am Beamer', async () => {
    setzeFakeZurueck(eingeloggteSession())
    const user = userEvent.setup()
    fakeSupabase.from.mockImplementation(() => abfrage({ data: [{ id: 'p1', titel: 'Einstieg Genetik', geaendert_am: '2026-11-01T10:00:00Z', kf_folien: [{ count: 2 }] }], error: null }))
    const e: Ergebnisse = {
      id: SITZUNG,
      pin: '123456',
      titel: 'Einstieg Genetik',
      folie_nr: 0,
      anzahl_folien: 2,
      folie: { typ: 'wortwolke', text: 'Was fällt dir zu DNA ein?', inhalt: { woerter: 2 } },
      abstimmung_offen: true,
      ergebnisse_sichtbar: true,
      teilnehmer: 0,
      abgestimmt: 0,
      antworten: [],
      fragen: [],
    }
    rpcAntworten({ kf_sitzung_starten: { id: SITZUNG, pin: '123456' }, kf_ergebnisse: e })
    zeige('/leiten')
    await user.click(await screen.findByRole('button', { name: 'Einstieg Genetik präsentieren' }))
    expect(await screen.findByLabelText('PIN')).toHaveTextContent('123456')
    expect(aufrufe('kf_sitzung_starten')[0]).toEqual({ p_praesentation: 'p1' })
  })
})

describe('Präsentieren (Beamer)', () => {
  const basis = (mehr: Partial<Ergebnisse> = {}): Ergebnisse => ({
    id: SITZUNG,
    pin: '123456',
    titel: 'Einstieg',
    folie_nr: 0,
    anzahl_folien: 2,
    folie: { typ: 'wortwolke', text: 'Was fällt dir zu DNA ein?', inhalt: { woerter: 2 } },
    abstimmung_offen: true,
    ergebnisse_sichtbar: true,
    teilnehmer: 3,
    abgestimmt: 2,
    antworten: [
      { id: 1, antwort: 'Erbgut', versteckt: false },
      { id: 2, antwort: 'erbgut', versteckt: false },
      { id: 3, antwort: 'Doppelhelix', versteckt: false },
    ],
    fragen: [],
    ...mehr,
  })
  beforeEach(() => setzeFakeZurueck(eingeloggteSession()))

  it('zeigt die Wortwolke, blendet Wörter aus und schaltet weiter', async () => {
    const user = userEvent.setup()
    let e = basis()
    rpcAntworten({
      kf_ergebnisse: () => e,
      kf_antwort_ausblenden: null,
      kf_sitzung_steuern: (a: Args) => {
        e = { ...e, folie_nr: a.p_folie_nr as number, abstimmung_offen: a.p_offen as boolean, ergebnisse_sichtbar: a.p_sichtbar as boolean }
        return null
      },
    })
    zeige(`/leiten/sitzung/${SITZUNG}`)
    await user.click(await screen.findByRole('button', { name: 'Los geht’s' }))
    const wolke = screen.getByRole('list', { name: 'Wortwolke' })
    expect(within(wolke).getByText('Erbgut')).toBeInTheDocument()
    expect(within(wolke).queryByText('erbgut')).toBeNull() // zusammengefasst
    await user.click(within(wolke).getByText('Erbgut'))
    await waitFor(() => expect(aufrufe('kf_antwort_ausblenden')).toHaveLength(2))
    expect(aufrufe('kf_antwort_ausblenden').map((a) => a.p_antwort)).toEqual([1, 2])

    await user.click(screen.getByRole('button', { name: /Ergebnisse verbergen/ }))
    expect(await screen.findByText('Ergebnisse verborgen')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Abstimmung offen/ }))
    expect(await screen.findByRole('button', { name: /Abstimmung geschlossen/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weiter →' }))
    await waitFor(() => expect(screen.getByText('Folie 2 / 2', { exact: false })).toBeInTheDocument())
    expect(aufrufe('kf_sitzung_steuern').at(-1)).toEqual({ p_sitzung: SITZUNG, p_folie_nr: 1, p_offen: true, p_sichtbar: false })
  })

  it('Fragen der Klasse: meistgewünschte zuerst, als beantwortet markieren', async () => {
    const user = userEvent.setup()
    rpcAntworten({
      kf_ergebnisse: basis({
        folie: { typ: 'fragen', text: 'Eure Fragen', inhalt: {} },
        antworten: [],
        fragen: [
          { id: 1, text: 'Was ist ein Gen?', versteckt: false, beantwortet: false, stimmen: 1 },
          { id: 2, text: 'Wie lang ist die DNA?', versteckt: false, beantwortet: false, stimmen: 5 },
          { id: 3, text: 'Unpassend', versteckt: true, beantwortet: false, stimmen: 9 },
        ],
      }),
      kf_frage_markieren: null,
    })
    zeige(`/leiten/sitzung/${SITZUNG}`)
    await user.click(await screen.findByRole('button', { name: 'Los geht’s' }))
    const texte = (await screen.findAllByText(/\?$/)).map((x) => x.textContent)
    expect(texte.indexOf('Wie lang ist die DNA?')).toBeLessThan(texte.indexOf('Was ist ein Gen?'))
    expect(screen.queryByText('Unpassend')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: /beantwortet/i })[0])
    await waitFor(() => expect(aufrufe('kf_frage_markieren')[0]).toEqual({ p_frage: 2, p_versteckt: false, p_beantwortet: true }))
  })
})

describe('Mitmachen (Handy)', () => {
  it('tritt mit PIN bei, stimmt ab und kann die Antwort ändern', async () => {
    const user = userEvent.setup()
    let meine: unknown[] = []
    const folie: Folie = { typ: 'auswahl', text: 'Lieblingsorganell?', inhalt: { optionen: ['Zellkern', 'Mitochondrium'], mehrfach: false } }
    rpcAntworten({
      kf_beitreten: T,
      kf_zustand: () => zustand(folie, { meine }),
      kf_antworten: (a: Args) => {
        meine = [a.p_antwort]
        return { ok: true }
      },
    })
    zeige('/mitmachen?pin=123456')
    expect(screen.getByRole('textbox')).toHaveValue('123456')
    await user.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    await user.click(await screen.findByRole('button', { name: 'Mitochondrium' }))
    expect(await screen.findByText('Danke! ✓')).toBeInTheDocument()
    expect(aufrufe('kf_antworten')[0]).toMatchObject({ p_folie_nr: 0, p_antwort: [1], p_token: 'geheim' })
    expect(aufrufe('kf_beitreten')[0]).toEqual({ p_pin: '123456' })
    // Kein Name wird gespeichert, nur Kennung und Token
    expect(JSON.parse(localStorage.getItem('klassenfunk-teilnahme')!)).toMatchObject({ teilnehmer_id: T.teilnehmer_id })

    await user.click(screen.getByRole('button', { name: 'Antwort ändern' }))
    await user.click(screen.getByRole('button', { name: 'Zellkern' }))
    await waitFor(() => expect(aufrufe('kf_antworten').at(-1)).toMatchObject({ p_antwort: [0] }))
  })

  it('zeigt eine Fehlermeldung bei falscher PIN', async () => {
    const user = userEvent.setup()
    rpcAntworten({ kf_beitreten: new Error('KF: Keine Sitzung mit dieser PIN.') })
    zeige('/mitmachen')
    await user.type(screen.getByRole('textbox'), '999999')
    await user.click(screen.getByRole('button', { name: 'Los geht’s!' }))
    expect(await screen.findByText('Keine Sitzung mit dieser PIN.')).toBeInTheDocument()
  })

  it('Wortwolke: mehrere Begriffe nacheinander', async () => {
    localStorage.setItem('klassenfunk-teilnahme', JSON.stringify({ ...T, gemerkt: Date.now() }))
    const user = userEvent.setup()
    let meine: unknown[] = []
    rpcAntworten({
      kf_zustand: () => zustand({ typ: 'wortwolke', text: 'DNA?', inhalt: { woerter: 2 } }, { meine }),
      kf_antworten: (a: Args) => {
        meine = [...meine, a.p_antwort]
        return { ok: true }
      },
    })
    zeige('/mitmachen')
    expect(await screen.findByText('Noch 2 Einsendungen')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Antwort'), '  Erbgut {Enter}')
    expect(await screen.findByText('Noch 1 Einsendung')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Antwort'), 'Helix{Enter}')
    expect(await screen.findByText('Danke! ✓')).toBeInTheDocument()
    expect(aufrufe('kf_antworten').map((a) => a.p_antwort)).toEqual(['Erbgut', 'Helix'])
  })

  it('100 Punkte: Senden erst, wenn alles verteilt ist', async () => {
    localStorage.setItem('klassenfunk-teilnahme', JSON.stringify({ ...T, gemerkt: Date.now() }))
    const user = userEvent.setup()
    rpcAntworten({ kf_zustand: zustand({ typ: 'punkte', text: 'Wofür Geld?', inhalt: { optionen: ['Sport', 'Musik'] } }), kf_antworten: { ok: true } })
    zeige('/mitmachen')
    const senden = await screen.findByRole('button', { name: 'Senden' })
    expect(senden).toBeDisabled()
    for (let i = 0; i < 7; i++) await user.click(screen.getByRole('button', { name: 'Sport mehr' }))
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: 'Musik mehr' })) // nur noch 30 übrig
    expect(screen.getByText('Alle 100 Punkte verteilt ✓')).toBeInTheDocument()
    await user.click(senden)
    await waitFor(() => expect(aufrufe('kf_antworten')[0]).toMatchObject({ p_antwort: [70, 30] }))
  })

  it('Rangfolge: Reihenfolge mit Pfeilen ändern', async () => {
    localStorage.setItem('klassenfunk-teilnahme', JSON.stringify({ ...T, gemerkt: Date.now() }))
    const user = userEvent.setup()
    rpcAntworten({ kf_zustand: zustand({ typ: 'rangfolge', text: 'Was ist wichtig?', inhalt: { elemente: ['A', 'B', 'C'] } }), kf_antworten: { ok: true } })
    zeige('/mitmachen')
    await user.click(await screen.findByRole('button', { name: 'C nach oben' }))
    await user.click(screen.getByRole('button', { name: 'C nach oben' }))
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    await waitFor(() => expect(aufrufe('kf_antworten')[0]).toMatchObject({ p_antwort: [2, 0, 1] }))
  })

  it('Fragen der Klasse: Frage stellen und zustimmen, nicht bei eigener Frage', async () => {
    localStorage.setItem('klassenfunk-teilnahme', JSON.stringify({ ...T, gemerkt: Date.now() }))
    const user = userEvent.setup()
    rpcAntworten({
      kf_zustand: zustand(
        { typ: 'fragen', text: 'Eure Fragen', inhalt: {} },
        {
          fragen: [
            { id: 1, text: 'Was ist ein Gen?', beantwortet: false, stimmen: 2, meine_stimme: false, von_mir: false },
            { id: 2, text: 'Meine Frage', beantwortet: false, stimmen: 0, meine_stimme: false, von_mir: true },
          ],
        },
      ),
      kf_frage_stellen: { ok: true },
      kf_frage_stimmen: { gestimmt: true },
    })
    zeige('/mitmachen')
    await user.type(await screen.findByLabelText('Deine Frage'), 'Warum ist DNA doppelt?')
    await user.click(screen.getByRole('button', { name: 'Frage schicken' }))
    await waitFor(() => expect(aufrufe('kf_frage_stellen')[0]).toMatchObject({ p_text: 'Warum ist DNA doppelt?' }))
    await user.click(screen.getByRole('button', { name: 'Möchte ich auch wissen: Was ist ein Gen?' }))
    await waitFor(() => expect(aufrufe('kf_frage_stimmen')[0]).toMatchObject({ p_frage: 1 }))
    expect(screen.getByRole('button', { name: 'Möchte ich auch wissen: Meine Frage' })).toBeDisabled()
  })

  it('geschlossene Abstimmung und beendete Sitzung', async () => {
    localStorage.setItem('klassenfunk-teilnahme', JSON.stringify({ ...T, gemerkt: Date.now() }))
    rpcAntworten({ kf_zustand: zustand({ typ: 'offen', text: 'Was denkst du?', inhalt: { max_zeichen: 140, mehrfach: false } }, { abstimmung_offen: false }) })
    const { unmount } = zeige('/mitmachen')
    expect(await screen.findByText(/Abstimmung ist geschlossen/)).toBeInTheDocument()
    unmount()
    // Gemerkte Teilnahme an einer Sitzung, die es nicht mehr gibt → zurück zur PIN-Eingabe
    rpcAntworten({ kf_zustand: null })
    zeige('/mitmachen')
    expect(await screen.findByRole('button', { name: 'Los geht’s!' })).toBeInTheDocument()
  })
})

describe('gruppiereWoerter', () => {
  it('fasst ohne Groß-/Kleinschreibung zusammen, häufigste zuerst', () => {
    const g = gruppiereWoerter([
      { id: 3, antwort: 'Helix', versteckt: false },
      { id: 1, antwort: 'Erbgut', versteckt: false },
      { id: 2, antwort: 'ERBGUT ', versteckt: false },
      { id: 4, antwort: '   ', versteckt: false },
    ])
    expect(g.map((w) => [w.text, w.anzahl])).toEqual([
      ['Erbgut', 2],
      ['Helix', 1],
    ])
    expect(g[0].ids).toEqual([1, 2])
  })
})
