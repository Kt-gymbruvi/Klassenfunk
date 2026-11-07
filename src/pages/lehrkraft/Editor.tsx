import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Knopf, LehrkraftKopf } from '../../components.tsx'
import { ladePraesentation, speicherePraesentation } from '../../lib/daten.ts'
import { FOLIENTYPEN, GRENZEN, TYP_REIHENFOLGE, neueFolie, pruefePraesentation, wechsleTyp, type Folie, type FolienTyp } from '../../lib/folien.ts'
import { fehlerText } from '../../lib/supabase.ts'

const feld = 'w-full rounded-xl bg-white px-3 py-2 text-lg text-funk-petrol-dark placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-funk-koralle/60'
const auswahlStil = 'rounded-xl bg-white px-3 py-2 text-lg font-semibold text-funk-petrol-dark'

export default function Editor() {
  const { id } = useParams()
  const neu = id === 'neu'
  const navigate = useNavigate()
  const [titel, setTitel] = useState('')
  const [folien, setFolien] = useState<Folie[] | null>(neu ? [neueFolie('wortwolke')] : null)
  const [fehler, setFehler] = useState<string[]>([])
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    if (neu || !id) return
    ladePraesentation(id)
      .then((p) => {
        setTitel(p.titel)
        setFolien(p.folien)
      })
      .catch((e) => setFehler([fehlerText(e)]))
  }, [id, neu])

  const aendere = (i: number, f: Folie) => setFolien((l) => l && l.map((x, j) => (j === i ? f : x)))
  const verschiebe = (i: number, r: number) =>
    setFolien((l) => {
      if (!l || i + r < 0 || i + r >= l.length) return l
      const n = [...l]
      ;[n[i], n[i + r]] = [n[i + r], n[i]]
      return n
    })

  async function speichern() {
    if (!folien) return
    const probleme = pruefePraesentation(titel, folien)
    if (probleme.length) return setFehler(probleme)
    setSpeichert(true)
    try {
      await speicherePraesentation(neu ? null : id!, titel, folien)
      navigate('/leiten', { state: { hinweis: `„${titel.trim()}“ wurde gespeichert.` } })
    } catch (e) {
      setFehler([fehlerText(e)])
      setSpeichert(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-6 py-5 pb-24 lg:px-10">
      <LehrkraftKopf
        links={
          <Link to="/leiten" className="text-xl text-white/80 hover:text-funk-koralle">
            ← Meine Präsentationen
          </Link>
        }
      />
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-w-72 flex-1 flex-col gap-2 text-lg font-semibold">
          Titel der Präsentation
          <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={200} placeholder="z. B. Einstieg Evolution" className={`${feld} !py-3 !text-2xl font-bold`} />
        </label>
        <Knopf onClick={speichern} disabled={speichert || !folien} className="!px-8 !py-4 !text-2xl">
          {speichert ? 'Speichert …' : 'Speichern'}
        </Knopf>
      </div>
      {fehler.length > 0 && (
        <div role="alert" className="rounded-2xl bg-red-500/20 px-5 py-4 text-lg font-semibold text-red-100 ring-2 ring-red-400/60">
          <ul className="list-disc pl-6">
            {fehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {!folien && !fehler.length && <p className="text-2xl text-white/70">Wird geladen …</p>}

      {folien?.map((f, i) => (
        <section key={i} className="flex flex-col gap-4 rounded-3xl bg-funk-petrol-light/70 p-5 ring-1 ring-white/10" aria-label={`Folie ${i + 1}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-black text-funk-koralle">Folie {i + 1}</span>
            <select value={f.typ} onChange={(e) => aendere(i, wechsleTyp(f, e.target.value as FolienTyp))} aria-label={`Typ Folie ${i + 1}`} className={auswahlStil}>
              {TYP_REIHENFOLGE.map((t) => (
                <option key={t} value={t}>
                  {FOLIENTYPEN[t].symbol} {FOLIENTYPEN[t].name}
                </option>
              ))}
            </select>
            <span className="text-base text-white/60">{FOLIENTYPEN[f.typ].beschreibung}</span>
            <div className="ml-auto flex gap-2">
              <Knopf art="leise" className="!px-4 !py-2" onClick={() => verschiebe(i, -1)} disabled={i === 0} aria-label={`Folie ${i + 1} nach oben`}>
                ↑
              </Knopf>
              <Knopf art="leise" className="!px-4 !py-2" onClick={() => verschiebe(i, 1)} disabled={i === folien.length - 1} aria-label={`Folie ${i + 1} nach unten`}>
                ↓
              </Knopf>
              <Knopf art="leise" className="!px-4 !py-2" onClick={() => setFolien((l) => l && l.filter((_, j) => j !== i))} aria-label={`Folie ${i + 1} entfernen`}>
                Entfernen
              </Knopf>
            </div>
          </div>
          <input
            value={f.text}
            onChange={(e) => aendere(i, { ...f, text: e.target.value })}
            maxLength={GRENZEN.text}
            placeholder={f.typ === 'info' ? 'Überschrift' : 'Frage, z. B. Was fällt dir zu „Evolution“ ein?'}
            aria-label={`Text Folie ${i + 1}`}
            className={`${feld} !text-xl font-bold`}
          />
          <FolienFelder f={f} nr={i + 1} aendere={(n) => aendere(i, n)} />
        </section>
      ))}

      {folien && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold">Folie hinzufügen:</p>
          <div className="flex flex-wrap gap-2">
            {TYP_REIHENFOLGE.map((t) => (
              <Knopf key={t} art="leise" className="!px-4 !py-2 !text-lg" onClick={() => setFolien((l) => l && [...l, neueFolie(t)])}>
                + {FOLIENTYPEN[t].symbol} {FOLIENTYPEN[t].name}
              </Knopf>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

/** Liste von Texten bearbeiten (Antworten, Begriffe, Aussagen) */
function TextListe({ werte, setze, max, laenge, name, nr }: { werte: string[]; setze: (w: string[]) => void; max: number; laenge: number; name: string; nr: number }) {
  return (
    <div className="flex flex-col gap-2">
      {werte.map((w, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={w}
            onChange={(e) => setze(werte.map((x, j) => (j === i ? e.target.value : x)))}
            maxLength={laenge}
            placeholder={`${name} ${i + 1}`}
            aria-label={`Folie ${nr} ${name} ${i + 1}`}
            className={feld}
          />
          <Knopf art="leise" className="!px-3 !py-1" onClick={() => setze(werte.filter((_, j) => j !== i))} disabled={werte.length <= 1} aria-label={`Folie ${nr} ${name} ${i + 1} entfernen`}>
            ✕
          </Knopf>
        </div>
      ))}
      {werte.length < max && (
        <button type="button" onClick={() => setze([...werte, ''])} className="self-start rounded-xl border-2 border-dashed border-white/30 px-4 py-2 text-lg hover:border-funk-koralle">
          + {name}
        </button>
      )}
    </div>
  )
}

function Zeile({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 text-lg">{children}</div>
}

function FolienFelder({ f, nr, aendere }: { f: Folie; nr: number; aendere: (f: Folie) => void }) {
  switch (f.typ) {
    case 'auswahl':
      return (
        <>
          <TextListe werte={f.inhalt.optionen} setze={(o) => aendere({ ...f, inhalt: { ...f.inhalt, optionen: o } })} max={8} laenge={GRENZEN.option} name="Antwort" nr={nr} />
          <Zeile>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.inhalt.mehrfach} onChange={(e) => aendere({ ...f, inhalt: { ...f.inhalt, mehrfach: e.target.checked } })} className="h-5 w-5" />
              Mehrere Antworten erlaubt
            </label>
          </Zeile>
        </>
      )
    case 'wortwolke':
      return (
        <Zeile>
          Wörter pro Person
          <select value={f.inhalt.woerter} onChange={(e) => aendere({ ...f, inhalt: { woerter: Number(e.target.value) as 1 | 2 | 3 } })} aria-label={`Folie ${nr} Wörter pro Person`} className={auswahlStil}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Zeile>
      )
    case 'offen':
      return (
        <Zeile>
          Höchstens
          <select value={f.inhalt.max_zeichen} onChange={(e) => aendere({ ...f, inhalt: { ...f.inhalt, max_zeichen: Number(e.target.value) } })} aria-label={`Folie ${nr} Zeichen`} className={auswahlStil}>
            {[60, 140, 280].map((n) => (
              <option key={n} value={n}>
                {n} Zeichen
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.inhalt.mehrfach} onChange={(e) => aendere({ ...f, inhalt: { ...f.inhalt, mehrfach: e.target.checked } })} className="h-5 w-5" />
            bis zu 3 Antworten pro Person
          </label>
        </Zeile>
      )
    case 'skala':
      return (
        <>
          <TextListe werte={f.inhalt.aussagen} setze={(a) => aendere({ ...f, inhalt: { ...f.inhalt, aussagen: a } })} max={6} laenge={GRENZEN.aussage} name="Aussage" nr={nr} />
          <Zeile>
            <span>1 =</span>
            <input value={f.inhalt.links} onChange={(e) => aendere({ ...f, inhalt: { ...f.inhalt, links: e.target.value } })} maxLength={GRENZEN.skalaEnde} aria-label={`Folie ${nr} Skala links`} className={`${feld} !w-56`} />
            <span>5 =</span>
            <input value={f.inhalt.rechts} onChange={(e) => aendere({ ...f, inhalt: { ...f.inhalt, rechts: e.target.value } })} maxLength={GRENZEN.skalaEnde} aria-label={`Folie ${nr} Skala rechts`} className={`${feld} !w-56`} />
          </Zeile>
        </>
      )
    case 'rangfolge':
      return <TextListe werte={f.inhalt.elemente} setze={(e) => aendere({ ...f, inhalt: { elemente: e } })} max={8} laenge={GRENZEN.element} name="Begriff" nr={nr} />
    case 'punkte':
      return <TextListe werte={f.inhalt.optionen} setze={(o) => aendere({ ...f, inhalt: { optionen: o } })} max={8} laenge={GRENZEN.element} name="Möglichkeit" nr={nr} />
    case 'raster': {
      const achse = (k: 'x' | 'y', i: 0 | 1, label: string) => (
        <input
          value={f.inhalt[k][i]}
          onChange={(e) => {
            const neu = [...f.inhalt[k]] as [string, string]
            neu[i] = e.target.value
            aendere({ ...f, inhalt: { ...f.inhalt, [k]: neu } })
          }}
          maxLength={GRENZEN.achse}
          placeholder={label}
          aria-label={`Folie ${nr} ${label}`}
          className={`${feld} !w-56`}
        />
      )
      return (
        <>
          <TextListe werte={f.inhalt.elemente} setze={(e) => aendere({ ...f, inhalt: { ...f.inhalt, elemente: e } })} max={6} laenge={GRENZEN.rasterElement} name="Begriff" nr={nr} />
          <Zeile>
            Waagrecht: {achse('x', 0, 'links')} bis {achse('x', 1, 'rechts')}
          </Zeile>
          <Zeile>
            Senkrecht: {achse('y', 0, 'unten')} bis {achse('y', 1, 'oben')}
          </Zeile>
        </>
      )
    }
    case 'fragen':
      return <p className="text-lg text-white/70">Die Klasse schickt anonym Fragen, andere geben 👍. Du siehst die meistgewünschten oben und kannst einzelne ausblenden.</p>
    case 'info':
      return (
        <textarea
          value={f.inhalt.text}
          onChange={(e) => aendere({ ...f, inhalt: { text: e.target.value } })}
          maxLength={GRENZEN.info}
          rows={4}
          placeholder="Text auf der Folie (optional)"
          aria-label={`Folie ${nr} Text`}
          className={feld}
        />
      )
  }
}
