import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Knopf, LehrkraftKopf, Meldung } from '../../components.tsx'
import { ladePraesentation, ladePraesentationen, loeschePraesentation, speicherePraesentation, starteSitzung, type PraesentationKurz } from '../../lib/daten.ts'
import { raeumeBilderAuf } from '../../lib/medien.ts'
import { fehlerText } from '../../lib/supabase.ts'

const datum = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Liste() {
  const location = useLocation()
  const navigate = useNavigate()
  const [hinweis, setHinweis] = useState<string | null>((location.state as { hinweis?: string } | null)?.hinweis ?? null)
  const [liste, setListe] = useState<PraesentationKurz[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [startet, setStartet] = useState<string | null>(null)

  const laden = useCallback(() => {
    ladePraesentationen()
      .then((l) => {
        setListe(l)
        setFehler(null)
      })
      .catch((e) => setFehler(fehlerText(e)))
  }, [])
  useEffect(laden, [laden])

  async function starten(p: PraesentationKurz) {
    setStartet(p.id)
    try {
      const s = await starteSitzung(p.id)
      navigate(`/leiten/sitzung/${s.id}`)
    } catch (e) {
      setFehler(fehlerText(e))
      setStartet(null)
    }
  }
  async function kopieren(p: PraesentationKurz) {
    try {
      const v = await ladePraesentation(p.id)
      await speicherePraesentation(null, `${v.titel} (Kopie)`.slice(0, 200), v.folien)
      setHinweis(`„${p.titel}“ wurde kopiert.`)
      laden()
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }
  async function loeschen(p: PraesentationKurz) {
    if (!window.confirm(`Präsentation „${p.titel}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return
    try {
      await loeschePraesentation(p.id)
      void raeumeBilderAuf()
      laden()
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 px-6 py-5 lg:px-10">
      <LehrkraftKopf />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-4xl font-extrabold">Meine Präsentationen</h2>
        <Link
          to="/leiten/praesentation/neu"
          className="rounded-2xl bg-funk-koralle px-6 py-3 text-xl font-extrabold text-funk-petrol-dark shadow-[0_5px_0_var(--color-funk-koralle-dark)] active:translate-y-1 active:shadow-none"
        >
          + Neue Präsentation
        </Link>
      </div>
      {hinweis && <Meldung art="erfolg">{hinweis}</Meldung>}
      {fehler && <Meldung art="fehler">{fehler}</Meldung>}
      {liste === null && !fehler && <p className="text-2xl text-white/70">Wird geladen …</p>}
      {liste?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border-3 border-dashed border-white/25 px-6 py-16 text-center">
          <p className="text-3xl font-bold">Noch keine Präsentationen</p>
          <p className="text-xl text-white/70">Lege mit „+ Neue Präsentation“ deine erste an – zum Beispiel eine Wortwolke zum Einstieg.</p>
        </div>
      )}
      {liste && liste.length > 0 && (
        <ul className="flex flex-col gap-3">
          {liste.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl bg-funk-petrol-light/70 px-5 py-4 ring-1 ring-white/10">
              <Link to={`/leiten/praesentation/${p.id}`} className="group min-w-56 flex-1">
                <h3 className="text-2xl font-extrabold leading-tight break-words group-hover:text-funk-koralle">{p.titel}</h3>
                <p className="mt-1 text-base text-white/65">
                  {p.anzahlFolien} {p.anzahlFolien === 1 ? 'Folie' : 'Folien'} · bearbeitet {datum.format(new Date(p.geaendert_am))}
                </p>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Knopf onClick={() => starten(p)} disabled={!p.anzahlFolien || startet !== null} className="!px-5 !py-3" aria-label={`${p.titel} präsentieren`}>
                  {startet === p.id ? 'Startet …' : '▶ Präsentieren'}
                </Knopf>
                <Knopf art="leise" onClick={() => kopieren(p)} className="!px-4 !py-3 !text-lg" aria-label={`${p.titel} kopieren`}>
                  ⧉
                </Knopf>
                <Knopf art="leise" onClick={() => loeschen(p)} className="!px-4 !py-3 !text-lg" aria-label={`${p.titel} löschen`}>
                  🗑
                </Knopf>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
