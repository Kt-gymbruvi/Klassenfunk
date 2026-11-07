import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Knopf, Logo, Meldung, ZurueckLink } from '../components.tsx'
import { Einpassen } from '../einpassen.tsx'
import {
  REAKTIONEN,
  gemerkteTeilnahme,
  ladeZustand,
  merkeTeilnahme,
  sendeAntwort,
  stelleFrage,
  stimmeFuerFrage,
  trittBei,
  useRegelmaessig,
  useSitzungsKanal,
  type Barometer,
  type Teilnahme,
  type Zustand,
} from '../lib/daten.ts'
import type { Folie } from '../lib/folien.ts'
import { fehlerText } from '../lib/supabase.ts'

// Handy (Schüler): anonym, nur PIN. Eine Folie nach der anderen, wie die Lehrkraft weiterschaltet.

export default function Mitmachen() {
  const [params] = useSearchParams()
  const [teilnahme, setTeilnahme] = useState<Teilnahme | null>(() => {
    const t = gemerkteTeilnahme()
    const pin = params.get('pin')
    if (t && pin && t.pin && t.pin !== pin) {
      merkeTeilnahme(null)
      return null
    }
    return t
  })
  const verlassen = useCallback(() => {
    merkeTeilnahme(null)
    setTeilnahme(null)
  }, [])

  if (!teilnahme)
    return (
      <Beitreten
        fertig={(t) => {
          merkeTeilnahme(t)
          setTeilnahme(t)
        }}
      />
    )
  return <Sitzung t={teilnahme} verlassen={verlassen} />
}

function Beitreten({ fertig }: { fertig: (t: Teilnahme) => void }) {
  const [params] = useSearchParams()
  const [pin, setPin] = useState(() => (params.get('pin') ?? '').replace(/\D/g, '').slice(0, 6))
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  async function absenden(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin)) return setFehler('Die PIN hat 6 Ziffern.')
    setLaeuft(true)
    setFehler(null)
    try {
      fertig({ ...(await trittBei(pin)), pin })
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setLaeuft(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <ZurueckLink />
      </header>
      <form onSubmit={absenden} className="flex flex-1 flex-col justify-center gap-5">
        <h2 className="text-center text-3xl font-extrabold">Mitmachen</h2>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          PIN vom Beamer
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456"
            className="rounded-2xl bg-white px-4 py-4 text-center text-4xl font-black tracking-[0.2em] text-funk-petrol-dark placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-funk-koralle/60"
          />
        </label>
        <p className="text-center text-base text-white/75">Kein Name, kein Konto – deine Antworten sind anonym.</p>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        <Knopf type="submit" disabled={laeuft} className="!py-5 !text-2xl">
          {laeuft ? 'Einen Moment …' : 'Los geht’s!'}
        </Knopf>
      </form>
    </main>
  )
}

function Sitzung({ t, verlassen }: { t: Teilnahme; verlassen: () => void }) {
  const [z, setZ] = useState<Zustand | null | undefined>(undefined)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const [bearbeiten, setBearbeiten] = useState(false)
  const erster = useRef(true)

  const laden = useCallback(async () => {
    try {
      const neu = await ladeZustand(t)
      if (neu === null && erster.current) return verlassen()
      erster.current = false
      setZ(neu)
    } catch (err) {
      setFehler(fehlerText(err))
    }
  }, [t, verlassen])
  const senden = useSitzungsKanal(t.sitzung_id, { aktualisieren: laden })
  useRegelmaessig(laden, 2000, z !== null)

  // Neue Folie: Eingabe zurücksetzen, alte Fehlermeldung weg
  const folieNr = z?.folie_nr
  useEffect(() => {
    setBearbeiten(false)
    setFehler(null)
  }, [folieNr])

  async function antworten(a: unknown) {
    if (!z) return
    setSendet(true)
    setFehler(null)
    try {
      await sendeAntwort(t, z.folie_nr, a)
      senden('aktualisieren')
      setBearbeiten(false)
      await laden()
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setSendet(false)
    }
  }

  let inhalt: ReactNode
  if (z === undefined) inhalt = <Mitte>{fehler ? <Meldung art="fehler">{fehler}</Meldung> : <p className="text-xl text-white/70">Verbinde …</p>}</Mitte>
  else if (z === null)
    inhalt = (
      <Mitte>
        <p className="text-2xl font-bold">Die Sitzung ist beendet.</p>
        <p className="text-lg text-white/70">Alle Antworten wurden gelöscht.</p>
        <Knopf onClick={verlassen}>Neue PIN eingeben</Knopf>
      </Mitte>
    )
  else {
    const f = z.folie
    const mehrfach = f.typ === 'wortwolke' || (f.typ === 'offen' && f.inhalt.mehrfach)
    const grenze = f.typ === 'wortwolke' ? f.inhalt.woerter : 3
    const fertig = z.meine.length > 0 && !bearbeiten && (!mehrfach || z.meine.length >= grenze)
    inhalt = (
      <div className="flex flex-1 flex-col gap-3">
        <p className="shrink-0 text-base text-white/60">
          Folie {z.folie_nr + 1} von {z.anzahl_folien}
        </p>
        <p className="shrink-0 text-2xl leading-snug font-extrabold">{f.text}</p>
        {fehler && <Meldung art="fehler">{fehler}</Meldung>}
        {f.typ === 'info' ? (
          <>
            {f.inhalt.text && <p className="text-lg whitespace-pre-line text-white/90">{f.inhalt.text}</p>}
            <Mitte>
              <p className="text-5xl" aria-hidden="true">
                👀
              </p>
              <p className="text-xl font-bold">Schau nach vorne!</p>
            </Mitte>
          </>
        ) : f.typ === 'fragen' ? (
          <FragenDerKlasse z={z} t={t} offen={z.abstimmung_offen} geaendert={() => (senden('aktualisieren'), laden())} />
        ) : !z.abstimmung_offen ? (
          <Mitte>
            <p className="text-2xl font-bold">🔒 Die Abstimmung ist geschlossen.</p>
            {z.meine.length > 0 && <p className="text-lg text-white/70">Deine Antwort ist angekommen.</p>}
          </Mitte>
        ) : fertig ? (
          <Mitte>
            <p className="text-3xl font-black">Danke! ✓</p>
            <p className="text-lg text-white/80">Deine Antwort ist angekommen.</p>
            {mehrfach && <EigeneListe werte={z.meine} />}
            {!mehrfach && (
              <Knopf art="leise" onClick={() => setBearbeiten(true)}>
                Antwort ändern
              </Knopf>
            )}
          </Mitte>
        ) : (
          <>
            {mehrfach && z.meine.length > 0 && <EigeneListe werte={z.meine} />}
            <Eingabe key={`${z.folie_nr}-${z.meine.length}`} folie={f} vorher={mehrfach ? undefined : z.meine[0]} senden={antworten} sendet={sendet} rest={mehrfach ? grenze - z.meine.length : 1} />
          </>
        )}
      </div>
    )
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 overflow-hidden px-4 py-3">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <span className="text-2xl font-black text-funk-koralle">Klassenfunk</span>
        <span className="truncate text-base text-white/60">{z?.titel}</span>
      </header>
      <Einpassen key={`${z?.folie_nr}-${bearbeiten}`} minimum={0.6}>
        {inhalt}
      </Einpassen>
      {z && <Rueckmeldung t={t} senden={senden} />}
    </main>
  )
}

function Mitte({ children }: { children: ReactNode }) {
  return <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">{children}</section>
}

function EigeneListe({ werte }: { werte: unknown[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="Deine Einsendungen">
      {werte.map((w, i) => (
        <li key={i} className="rounded-xl bg-white/15 px-3 py-1 text-lg font-bold">
          {String(w)}
        </li>
      ))}
    </ul>
  )
}

const feld = 'w-full rounded-2xl bg-white px-4 py-3 text-xl font-bold text-funk-petrol-dark placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-funk-koralle/60'
const FARBEN = ['bg-funk-koralle', 'bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-500', 'bg-rose-600', 'bg-teal-600', 'bg-orange-600']

/** Eingabe je Folientyp. `vorher`: bisherige Antwort (zum Ändern) */
function Eingabe({ folie, vorher, senden, sendet, rest }: { folie: Folie; vorher?: unknown; senden: (a: unknown) => void; sendet: boolean; rest: number }) {
  switch (folie.typ) {
    case 'auswahl':
      return <Auswahl optionen={folie.inhalt.optionen} mehrfach={folie.inhalt.mehrfach} vorher={vorher as number[] | undefined} senden={senden} sendet={sendet} />
    case 'wortwolke':
    case 'offen':
      return <TextEingabe max={folie.typ === 'wortwolke' ? 25 : folie.inhalt.max_zeichen} mehrzeilig={folie.typ === 'offen'} rest={rest} senden={senden} sendet={sendet} />
    case 'skala':
      return <Skala folie={folie} vorher={vorher as number[] | undefined} senden={senden} sendet={sendet} />
    case 'rangfolge':
      return <Rangfolge elemente={folie.inhalt.elemente} vorher={vorher as number[] | undefined} senden={senden} sendet={sendet} />
    case 'punkte':
      return <Punkte optionen={folie.inhalt.optionen} vorher={vorher as number[] | undefined} senden={senden} sendet={sendet} />
    case 'raster':
      return <Raster folie={folie} vorher={vorher as [number, number][] | undefined} senden={senden} sendet={sendet} />
    default:
      return null
  }
}

/** Ohne `onClick` ist es der Absende-Knopf des umgebenden Formulars (sonst würde Enter doppelt senden) */
function Senden({ onClick, disabled, sendet, children = 'Senden' }: { onClick?: () => void; disabled?: boolean; sendet: boolean; children?: ReactNode }) {
  return (
    <Knopf type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled || sendet} className="shrink-0 !py-4 !text-2xl">
      {sendet ? 'Wird gesendet …' : children}
    </Knopf>
  )
}

function Auswahl({ optionen, mehrfach, vorher, senden, sendet }: { optionen: string[]; mehrfach: boolean; vorher?: number[]; senden: (a: unknown) => void; sendet: boolean }) {
  const [gewaehlt, setGewaehlt] = useState<number[]>(vorher ?? [])
  return (
    <div className="flex flex-1 flex-col gap-2">
      {mehrfach && <p className="text-center text-base font-bold text-funk-koralle">Mehrere Antworten möglich</p>}
      <div className="grid flex-1 gap-2" style={{ gridTemplateRows: `repeat(${optionen.length}, minmax(min-content, 1fr))` }}>
        {optionen.map((o, i) => {
          const an = gewaehlt.includes(i)
          return (
            <button
              key={i}
              type="button"
              disabled={sendet}
              aria-pressed={mehrfach ? an : undefined}
              onClick={() => (mehrfach ? setGewaehlt((g) => (an ? g.filter((x) => x !== i) : [...g, i])) : senden([i]))}
              className={`rounded-2xl px-4 py-3 text-left text-xl font-bold text-white shadow-[0_5px_0_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-none ${FARBEN[i % FARBEN.length]} ${
                (mehrfach && !an && gewaehlt.length) || (!mehrfach && vorher && !vorher.includes(i)) ? 'opacity-50' : ''
              } ${an ? 'ring-4 ring-white' : ''}`}
            >
              {an ? '✓ ' : ''}
              {o}
            </button>
          )
        })}
      </div>
      {mehrfach && <Senden onClick={() => senden([...gewaehlt].sort((a, b) => a - b))} disabled={!gewaehlt.length} sendet={sendet} />}
    </div>
  )
}

function TextEingabe({ max, mehrzeilig, rest, senden, sendet }: { max: number; mehrzeilig: boolean; rest: number; senden: (a: unknown) => void; sendet: boolean }) {
  const [text, setText] = useState('')
  const leer = !text.trim()
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!leer) senden(text.trim())
      }}
    >
      {mehrzeilig ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={max} rows={4} placeholder="Deine Antwort" aria-label="Antwort" className={`${feld} resize-none !font-semibold`} />
      ) : (
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={max} placeholder="Ein Wort oder kurzer Begriff" aria-label="Antwort" autoComplete="off" className={feld} />
      )}
      <p className="flex justify-between text-base text-white/60">
        <span>{rest > 1 ? `Noch ${rest} Einsendungen` : rest === 1 ? 'Noch 1 Einsendung' : ''}</span>
        <span>
          {text.length} / {max}
        </span>
      </p>
      <Senden disabled={leer} sendet={sendet} />
    </form>
  )
}

function Skala({ folie, vorher, senden, sendet }: { folie: Extract<Folie, { typ: 'skala' }>; vorher?: number[]; senden: (a: unknown) => void; sendet: boolean }) {
  const [werte, setWerte] = useState<(number | null)[]>(vorher ?? folie.inhalt.aussagen.map(() => null))
  return (
    <div className="flex flex-col gap-4">
      <p className="flex justify-between text-sm text-white/70">
        <span>1 = {folie.inhalt.links}</span>
        <span>5 = {folie.inhalt.rechts}</span>
      </p>
      {folie.inhalt.aussagen.map((a, i) => (
        <fieldset key={i} className="flex flex-col gap-2">
          <legend className="mb-1 text-lg font-bold">{a}</legend>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={werte[i] === k}
                aria-label={`${a}: ${k}`}
                onClick={() => setWerte((w) => w.map((x, j) => (j === i ? k : x)))}
                className={`rounded-xl py-3 text-xl font-black ${werte[i] === k ? 'bg-funk-koralle text-funk-petrol-dark' : 'bg-white/10'}`}
              >
                {k}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <Senden onClick={() => senden(werte)} disabled={werte.some((w) => w === null)} sendet={sendet} />
    </div>
  )
}

function Rangfolge({ elemente, vorher, senden, sendet }: { elemente: string[]; vorher?: number[]; senden: (a: unknown) => void; sendet: boolean }) {
  const [liste, setListe] = useState<number[]>(vorher ?? elemente.map((_, i) => i))
  const tausche = (i: number, j: number) =>
    setListe((l) => {
      const n = [...l]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-base text-white/80">Wichtigstes nach oben (mit ↑ ↓).</p>
      <ol className="flex flex-col gap-2">
        {liste.map((e, i) => (
          <li key={e} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xl font-bold text-funk-petrol-dark">
            <span className="w-7 text-funk-petrol/50">{i + 1}.</span>
            <span className="min-w-0 flex-1 break-words">{elemente[e]}</span>
            <button type="button" onClick={() => tausche(i, i - 1)} disabled={i === 0} aria-label={`${elemente[e]} nach oben`} className="h-11 w-11 rounded-xl bg-funk-petrol/10 text-2xl disabled:opacity-20">
              ↑
            </button>
            <button type="button" onClick={() => tausche(i, i + 1)} disabled={i === liste.length - 1} aria-label={`${elemente[e]} nach unten`} className="h-11 w-11 rounded-xl bg-funk-petrol/10 text-2xl disabled:opacity-20">
              ↓
            </button>
          </li>
        ))}
      </ol>
      <Senden onClick={() => senden(liste)} sendet={sendet} />
    </div>
  )
}

function Punkte({ optionen, vorher, senden, sendet }: { optionen: string[]; vorher?: number[]; senden: (a: unknown) => void; sendet: boolean }) {
  const [werte, setWerte] = useState<number[]>(vorher ?? optionen.map(() => 0))
  const summe = werte.reduce((a, b) => a + b, 0)
  const rest = 100 - summe
  const setze = (i: number, v: number) => setWerte((w) => w.map((x, j) => (j === i ? Math.max(0, Math.min(x + rest, v)) : x)))
  return (
    <div className="flex flex-col gap-3">
      <p className={`text-center text-xl font-black ${rest === 0 ? 'text-emerald-300' : 'text-funk-koralle'}`} aria-live="polite">
        {rest === 0 ? 'Alle 100 Punkte verteilt ✓' : `Noch ${rest} Punkte zu verteilen`}
      </p>
      {optionen.map((o, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex justify-between text-lg font-bold">
            <span>{o}</span>
            <span className="tabular-nums">{werte[i]}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setze(i, werte[i] - 10)} className="h-11 w-12 rounded-xl bg-white/15 text-2xl font-black" aria-label={`${o} weniger`}>
              −
            </button>
            <input type="range" min={0} max={100} step={5} value={werte[i]} onChange={(e) => setze(i, Number(e.target.value))} aria-label={`Punkte für ${o}`} className="h-8 flex-1 accent-funk-koralle" />
            <button type="button" onClick={() => setze(i, werte[i] + 10)} className="h-11 w-12 rounded-xl bg-white/15 text-2xl font-black" aria-label={`${o} mehr`}>
              +
            </button>
          </div>
        </div>
      ))}
      <Senden onClick={() => senden(werte)} disabled={rest !== 0} sendet={sendet} />
    </div>
  )
}

function Raster({ folie, vorher, senden, sendet }: { folie: Extract<Folie, { typ: 'raster' }>; vorher?: [number, number][]; senden: (a: unknown) => void; sendet: boolean }) {
  const [werte, setWerte] = useState<[number, number][]>(vorher ?? folie.inhalt.elemente.map(() => [5, 5]))
  const setze = (i: number, k: 0 | 1, v: number) => setWerte((w) => w.map((x, j) => (j === i ? ((k === 0 ? [v, x[1]] : [x[0], v]) as [number, number]) : x)))
  return (
    <div className="flex flex-col gap-4">
      {folie.inhalt.elemente.map((e, i) => (
        <fieldset key={i} className="flex flex-col gap-1 rounded-2xl bg-white/5 p-3">
          <legend className="text-lg font-bold">{e}</legend>
          <label className="flex flex-col text-sm text-white/75">
            <span className="flex justify-between">
              <span>{folie.inhalt.x[0]}</span>
              <span>{folie.inhalt.x[1]}</span>
            </span>
            <input type="range" min={0} max={10} step={0.5} value={werte[i][0]} onChange={(ev) => setze(i, 0, Number(ev.target.value))} aria-label={`${e}: ${folie.inhalt.x[0]} bis ${folie.inhalt.x[1]}`} className="h-8 accent-funk-koralle" />
          </label>
          <label className="flex flex-col text-sm text-white/75">
            <span className="flex justify-between">
              <span>{folie.inhalt.y[0]}</span>
              <span>{folie.inhalt.y[1]}</span>
            </span>
            <input type="range" min={0} max={10} step={0.5} value={werte[i][1]} onChange={(ev) => setze(i, 1, Number(ev.target.value))} aria-label={`${e}: ${folie.inhalt.y[0]} bis ${folie.inhalt.y[1]}`} className="h-8 accent-sky-400" />
          </label>
        </fieldset>
      ))}
      <Senden onClick={() => senden(werte)} sendet={sendet} />
    </div>
  )
}

function FragenDerKlasse({ z, t, offen, geaendert }: { z: Zustand; t: Teilnahme; offen: boolean; geaendert: () => void }) {
  const [text, setText] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const fragen = [...(z.fragen ?? [])].sort((a, b) => Number(a.beantwortet) - Number(b.beantwortet) || b.stimmen - a.stimmen || a.id - b.id)
  async function fragen_stellen(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSendet(true)
    setFehler(null)
    try {
      await stelleFrage(t, text.trim())
      setText('')
      geaendert()
    } catch (err) {
      setFehler(fehlerText(err))
    } finally {
      setSendet(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {offen ? (
        <form onSubmit={fragen_stellen} className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} placeholder="Deine Frage (anonym)" aria-label="Deine Frage" className={`${feld} resize-none !text-lg !font-semibold`} />
          <Knopf type="submit" disabled={sendet || !text.trim()} className="!py-3 !text-xl">
            Frage schicken
          </Knopf>
        </form>
      ) : (
        <p className="text-center text-lg text-white/70">🔒 Gerade können keine Fragen gestellt werden.</p>
      )}
      {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      <ul className="flex flex-col gap-2" aria-label="Fragen der Klasse">
        {fragen.map((f) => (
          <li key={f.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${f.beantwortet ? 'bg-white/5 text-white/50' : 'bg-white/10'}`}>
            <span className={`flex-1 text-lg ${f.beantwortet ? 'line-through' : ''}`}>{f.text}</span>
            <button
              type="button"
              disabled={f.von_mir}
              aria-pressed={f.meine_stimme}
              aria-label={`Möchte ich auch wissen: ${f.text}`}
              onClick={async () => {
                try {
                  await stimmeFuerFrage(t, f.id)
                  geaendert()
                } catch (err) {
                  setFehler(fehlerText(err))
                }
              }}
              className={`shrink-0 rounded-xl px-3 py-2 text-lg font-bold tabular-nums disabled:opacity-60 ${f.meine_stimme ? 'bg-funk-koralle text-funk-petrol-dark' : 'bg-white/15'}`}
            >
              👍 {f.stimmen}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Unten: Reaktionen und Tempo-/Verständnis-Barometer (nur Echtzeit-Nachrichten, nichts gespeichert) */
function Rueckmeldung({ t, senden }: { t: Teilnahme; senden: (event: 'reaktion' | 'barometer', payload: object) => void }) {
  const [offen, setOffen] = useState(false)
  const [b, setB] = useState<Pick<Barometer, 'tempo' | 'verstanden'>>({ tempo: null, verstanden: null })
  const [gesperrt, setGesperrt] = useState(false)
  const melden = useCallback((neu: Pick<Barometer, 'tempo' | 'verstanden'>) => senden('barometer', { teilnehmer: t.teilnehmer_id, ...neu }), [senden, t.teilnehmer_id])
  // Rückmeldung regelmäßig wiederholen, damit sie am Beamer „frisch“ bleibt
  useRegelmaessig(() => (b.tempo !== null || b.verstanden !== null) && melden(b), 60_000, b.tempo !== null || b.verstanden !== null)

  function aendere(neu: Pick<Barometer, 'tempo' | 'verstanden'>) {
    setB(neu)
    melden(neu)
  }
  function reaktion(emoji: string) {
    if (gesperrt) return
    senden('reaktion', { emoji })
    setGesperrt(true) // höchstens eine Reaktion pro Sekunde
    setTimeout(() => setGesperrt(false), 1000)
  }
  const wahl = (aktiv: boolean) => `min-w-0 flex-1 rounded-xl px-1 py-2 text-[clamp(0.8rem,4vw,1rem)] font-bold ${aktiv ? 'bg-funk-koralle text-funk-petrol-dark' : 'bg-white/10'}`
  return (
    <section className="shrink-0 rounded-2xl bg-funk-petrol-dark/70 p-2" aria-label="Rückmeldung">
      <div className="flex items-center justify-between gap-1">
        {REAKTIONEN.map((r) => (
          <button key={r} type="button" onClick={() => reaktion(r)} aria-label={`Reaktion ${r}`} className="min-w-0 flex-1 rounded-xl py-1 text-[clamp(1.25rem,7vw,1.875rem)] active:scale-90 disabled:opacity-40" disabled={gesperrt}>
            {r}
          </button>
        ))}
        <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen} className="shrink-0 rounded-xl bg-white/10 px-2.5 py-2 text-base font-bold">
          {offen ? '▾' : 'Tempo'}
        </button>
      </div>
      {offen && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="-mb-1 text-sm font-semibold text-white/60">Tempo</p>
          <div className="flex gap-1" role="group" aria-label="Tempo">
            {(
              [
                [-1, '🐢 zu langsam'],
                [0, '👌 passt'],
                [1, '🐇 zu schnell'],
              ] as const
            ).map(([w, txt]) => (
              <button key={w} type="button" aria-pressed={b.tempo === w} onClick={() => aendere({ ...b, tempo: b.tempo === w ? null : w })} className={wahl(b.tempo === w)}>
                {txt}
              </button>
            ))}
          </div>
          <p className="-mb-1 text-sm font-semibold text-white/60">Hast du es verstanden?</p>
          <div className="flex gap-1" role="group" aria-label="Verstanden">
            {(
              [
                [0, '❓ nein'],
                [1, '🤏 teils'],
                [2, '✅ ja'],
              ] as const
            ).map(([w, txt]) => (
              <button key={w} type="button" aria-pressed={b.verstanden === w} onClick={() => aendere({ ...b, verstanden: b.verstanden === w ? null : w })} className={wahl(b.verstanden === w)}>
                {txt}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
