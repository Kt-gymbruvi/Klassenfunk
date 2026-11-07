import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Knopf, Meldung } from '../../components.tsx'
import { Einpassen } from '../../einpassen.tsx'
import { Ergebnis } from '../../ansicht/Ergebnis.tsx'
import {
  beendeSitzung,
  blendeAntwortAus,
  ladeErgebnisse,
  markiereFrage,
  mitmachLink,
  steuereSitzung,
  useRegelmaessig,
  useSitzungsKanal,
  type Barometer,
  type Ergebnisse,
} from '../../lib/daten.ts'
import { FOLIENTYPEN } from '../../lib/folien.ts'
import { fehlerText } from '../../lib/supabase.ts'

// Beamer (iPad quer): Folie mit Live-Ergebnissen, Steuerung unten, Reaktionen und Tempo-Barometer.

const BAROMETER_MS = 3 * 60_000 // Rückmeldungen der letzten 3 Minuten zählen

export default function Praesentieren() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [e, setE] = useState<Ergebnisse | null | undefined>(undefined)
  const [fehler, setFehler] = useState<string | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [qrGross, setQrGross] = useState(true)
  const [reaktionen, setReaktionen] = useState<{ id: number; emoji: string; x: number }[]>([])
  const barometer = useRef(new Map<string, Barometer & { zeit: number }>())
  const [, setTick] = useState(0)

  const laden = useCallback(async () => {
    if (!id) return
    try {
      setE(await ladeErgebnisse(id))
      setFehler(null)
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }, [id])

  const senden = useSitzungsKanal(id, {
    aktualisieren: laden,
    reaktion: (r) => {
      if (typeof r?.emoji !== 'string' || r.emoji.length > 8) return
      const neu = { id: Math.random(), emoji: r.emoji, x: 10 + Math.random() * 80 }
      setReaktionen((l) => [...l.slice(-25), neu])
      setTimeout(() => setReaktionen((l) => l.filter((x) => x.id !== neu.id)), 3500)
    },
    barometer: (b) => {
      if (typeof b?.teilnehmer !== 'string') return
      barometer.current.set(b.teilnehmer, { ...b, zeit: Date.now() })
      setTick((t) => t + 1)
    },
  })
  useRegelmaessig(laden, 1500)
  // Barometer-Anzeige veraltet von selbst
  useRegelmaessig(() => setTick((t) => t + 1), 10_000)

  async function steuern(teil: Partial<{ nr: number; offen: boolean; sichtbar: boolean }>) {
    if (!id || !e) return
    setBeschaeftigt(true)
    try {
      await steuereSitzung(id, teil.nr ?? e.folie_nr, teil.offen ?? e.abstimmung_offen, teil.sichtbar ?? e.ergebnisse_sichtbar)
      await laden()
      senden('aktualisieren')
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setBeschaeftigt(false)
    }
  }

  async function beenden() {
    if (!id || !window.confirm('Sitzung beenden? Alle Antworten und Fragen werden gelöscht.')) return
    try {
      await beendeSitzung(id)
      senden('aktualisieren')
      navigate('/leiten', { replace: true, state: { hinweis: 'Sitzung beendet. Alle Antworten wurden gelöscht.' } })
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }

  if (e === undefined)
    return <Mitte>{fehler ? <Meldung art="fehler">{fehler}</Meldung> : <p className="text-3xl text-white/70">Wird geladen …</p>}</Mitte>
  if (e === null)
    return (
      <Mitte>
        <p className="text-4xl font-bold">Diese Sitzung gibt es nicht mehr.</p>
        <Link to="/leiten" className="text-2xl text-funk-koralle underline">
          Zu meinen Präsentationen
        </Link>
      </Mitte>
    )

  const folie = e.folie
  const mitAbstimmung = folie.typ !== 'info'
  const jetzt = Date.now()
  const aktuell = [...barometer.current.values()].filter((b) => jetzt - b.zeit < BAROMETER_MS)

  return (
    <main className="relative flex h-dvh flex-col gap-3 overflow-hidden px-6 py-4 lg:px-10">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black text-funk-koralle">Klassenfunk</span>
          <span className="text-xl text-white/70">{e.titel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xl">
          <button type="button" onClick={() => setQrGross((q) => !q)} className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/20" title="Beitreten-Hinweis groß zeigen">
            PIN <span className="tracking-widest text-funk-koralle">{e.pin}</span>
          </button>
          <span className="text-white/75">👥 {e.teilnehmer}</span>
          <BarometerAnzeige werte={aktuell} />
          <Knopf art="leise" className="!py-2 !text-lg" onClick={beenden}>
            Beenden
          </Knopf>
        </div>
      </header>

      {fehler && <Meldung art="fehler">{fehler}</Meldung>}

      <Einpassen key={`${e.folie_nr}-${qrGross}`}>
        {qrGross ? (
          <Beitreten pin={e.pin} teilnehmer={e.teilnehmer} weiter={() => setQrGross(false)} />
        ) : (
          <div className="flex flex-1 flex-col gap-5">
            <div className="flex items-center justify-between gap-4 text-xl text-white/60">
              <span>
                {FOLIENTYPEN[folie.typ].symbol} {FOLIENTYPEN[folie.typ].name}
              </span>
              {mitAbstimmung && folie.typ !== 'fragen' && (
                <span>
                  {e.abgestimmt} von {e.teilnehmer} haben abgestimmt
                </span>
              )}
            </div>
            <h2 className="rounded-3xl bg-white px-8 py-6 text-center text-5xl leading-tight font-extrabold text-funk-petrol-dark">{folie.text}</h2>
            {mitAbstimmung && !e.ergebnisse_sichtbar ? (
              <p className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <span className="text-6xl">🙈</span>
                <span className="text-4xl font-bold">Ergebnisse verborgen</span>
                <span className="text-2xl text-white/70">{folie.typ === 'fragen' ? `${e.fragen.length} Fragen` : `${e.antworten.length} Antworten`} bisher</span>
              </p>
            ) : (
              <Ergebnis
                folie={folie}
                antworten={e.antworten}
                fragen={e.fragen}
                ausblenden={async (ids) => {
                  try {
                    await Promise.all(ids.map((a) => blendeAntwortAus(a, true)))
                    await laden()
                  } catch (err) {
                    setFehler(fehlerText(err))
                  }
                }}
                frageMarkieren={async (f, versteckt, beantwortet) => {
                  try {
                    await markiereFrage(f.id, versteckt, beantwortet)
                    await laden()
                    senden('aktualisieren')
                  } catch (err) {
                    setFehler(fehlerText(err))
                  }
                }}
              />
            )}
          </div>
        )}
      </Einpassen>

      <nav className="flex shrink-0 flex-wrap items-center justify-between gap-3" aria-label="Steuerung">
        <Knopf art="leise" onClick={() => steuern({ nr: e.folie_nr - 1, offen: true })} disabled={beschaeftigt || e.folie_nr === 0} className="!text-2xl">
          ← Zurück
        </Knopf>
        <div className="flex flex-wrap items-center gap-3">
          {mitAbstimmung && (
            <>
              <Knopf art="leise" onClick={() => steuern({ offen: !e.abstimmung_offen })} disabled={beschaeftigt} className="!text-xl">
                {e.abstimmung_offen ? '🔓 Abstimmung offen' : '🔒 Abstimmung geschlossen'}
              </Knopf>
              <Knopf art="leise" onClick={() => steuern({ sichtbar: !e.ergebnisse_sichtbar })} disabled={beschaeftigt} className="!text-xl">
                {e.ergebnisse_sichtbar ? '🙈 Ergebnisse verbergen' : '👀 Ergebnisse zeigen'}
              </Knopf>
            </>
          )}
          <span className="text-xl font-bold text-white/70 tabular-nums">
            Folie {e.folie_nr + 1} / {e.anzahl_folien}
          </span>
        </div>
        <Knopf onClick={() => steuern({ nr: e.folie_nr + 1, offen: true })} disabled={beschaeftigt || e.folie_nr + 1 >= e.anzahl_folien} className="!text-2xl">
          Weiter →
        </Knopf>
      </nav>

      {/* Reaktionen steigen am Rand auf */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {reaktionen.map((r) => (
          <span key={r.id} className="absolute bottom-0 animate-[aufsteigen_3.5s_ease-out_forwards] text-6xl" style={{ left: `${r.x}%` }}>
            {r.emoji}
          </span>
        ))}
      </div>
    </main>
  )
}

function Mitte({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-8 text-center">{children}</main>
}

function Beitreten({ pin, teilnehmer, weiter }: { pin: string; teilnehmer: number; weiter: () => void }) {
  const link = mitmachLink(pin)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#072429', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [link])
  const adresse = `${window.location.host}${import.meta.env.BASE_URL}`.replace(/\/$/, '')
  return (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-10">
      <section className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-funk-petrol-dark">
        <p className="text-2xl font-semibold">
          Mitmachen auf <span className="font-black">{adresse}</span>
        </p>
        <p className="text-8xl font-black tracking-[0.15em] tabular-nums" aria-label="PIN">
          {pin}
        </p>
        {qr && <img src={qr} alt="QR-Code zum Mitmachen" className="h-64 w-64" />}
      </section>
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-5xl font-extrabold">👥 {teilnehmer} dabei</p>
        <p className="max-w-md text-2xl text-white/75">Ohne Namen und ohne Konto – nur die PIN.</p>
        <Knopf onClick={weiter} className="!px-10 !py-5 !text-3xl">
          Los geht’s
        </Knopf>
      </div>
    </div>
  )
}

/** Tempo und Verständnis der Klasse (letzte 3 Minuten) – klein in der Kopfzeile */
function BarometerAnzeige({ werte }: { werte: (Barometer & { zeit: number })[] }) {
  const tempo = werte.filter((w) => w.tempo !== null)
  const verst = werte.filter((w) => w.verstanden !== null)
  if (!tempo.length && !verst.length) return null
  const anzahl = <T,>(l: T[], f: (x: T) => boolean) => l.filter(f).length
  return (
    <span className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-1.5 text-lg" aria-label="Rückmeldung der Klasse">
      {tempo.length > 0 && (
        <span title="Tempo: zu langsam · passt · zu schnell">
          🐢 {anzahl(tempo, (w) => w.tempo === -1)} · 👌 {anzahl(tempo, (w) => w.tempo === 0)} · 🐇 {anzahl(tempo, (w) => w.tempo === 1)}
        </span>
      )}
      {verst.length > 0 && (
        <span title="Verstanden: nein · teils · ja">
          ❓ {anzahl(verst, (w) => w.verstanden === 0)} · 🤏 {anzahl(verst, (w) => w.verstanden === 1)} · ✅ {anzahl(verst, (w) => w.verstanden === 2)}
        </span>
      )}
    </span>
  )
}
