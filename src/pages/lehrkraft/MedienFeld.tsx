import { useRef, useState } from 'react'
import { Knopf } from '../../components.tsx'
import { leseZeit, youtubeId, youtubeStart, zeitText, type Medium } from '../../lib/folien.ts'
import { ladeBildHoch } from '../../lib/medien.ts'
import { fehlerText } from '../../lib/supabase.ts'

const feld = 'rounded-xl bg-white px-3 py-2 text-lg text-funk-petrol-dark placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-funk-koralle/60'

/** Bild hochladen oder YouTube-Link einfügen (Info-Folie). Erscheint nur am Beamer. */
export function MedienFeld({ medium, setze, nr }: { medium: Medium | undefined; setze: (m: Medium | undefined) => void; nr: number }) {
  const [link, setLink] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)
  const datei = useRef<HTMLInputElement>(null)

  async function hochladen(f: File | undefined) {
    if (!f) return
    setFehler(null)
    setLaedt(true)
    try {
      setze(await ladeBildHoch(f))
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setLaedt(false)
      if (datei.current) datei.current.value = ''
    }
  }

  function linkUebernehmen() {
    const s = link.trim()
    if (!s) return
    const id = youtubeId(s)
    if (id) {
      const start = youtubeStart(s)
      setze({ art: 'youtube', id, ...(start ? { start } : {}) })
      setLink('')
      setFehler(null)
    } else if (/^https:\/\/[^\s"<>]+\.(jpe?g|png|webp|gif)(\?[^\s"<>]*)?$/i.test(s) && s.length <= 1000) {
      setze({ art: 'bild', url: s })
      setLink('')
      setFehler(null)
    } else {
      setFehler('Das ist kein YouTube-Link. (Bilder bitte hochladen oder eine https-Adresse auf .jpg/.png angeben.)')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-black/15 p-4" aria-label={`Folie ${nr} Bild oder Video`}>
      <p className="text-lg font-semibold">
        Bild oder YouTube-Video <span className="font-normal text-white/60">(optional, nur am Beamer zu sehen)</span>
      </p>
      {medium?.art === 'bild' && (
        <div className="flex flex-wrap items-center gap-4">
          <img src={medium.url} alt={`Bild auf Folie ${nr}`} className="h-32 max-w-64 rounded-xl bg-white/10 object-contain" />
          <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => setze(undefined)}>
            Bild entfernen
          </Knopf>
        </div>
      )}
      {medium?.art === 'youtube' && (
        <div className="flex flex-wrap items-center gap-3 text-lg">
          <span className="rounded-xl bg-red-600 px-3 py-1 font-bold">▶ YouTube</span>
          <a href={`https://www.youtube.com/watch?v=${medium.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-funk-koralle">
            Video {medium.id}
          </a>
          <label className="flex items-center gap-2">
            Start bei
            <StartZeit wert={medium.start} setze={(start) => setze({ art: 'youtube', id: medium.id, ...(start ? { start } : {}) })} nr={nr} />
          </label>
          <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => setze(undefined)}>
            Video entfernen
          </Knopf>
        </div>
      )}
      {!medium && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={datei} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => hochladen(e.target.files?.[0])} aria-label={`Folie ${nr} Bild auswählen`} />
          <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={() => datei.current?.click()} disabled={laedt}>
            {laedt ? 'Lädt hoch …' : '🖼 Bild hochladen'}
          </Knopf>
          <span className="text-white/60">oder</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), linkUebernehmen())}
            placeholder="YouTube-Link einfügen"
            aria-label={`Folie ${nr} YouTube-Link`}
            className={`${feld} min-w-60 flex-1`}
          />
          <Knopf art="leise" className="!px-4 !py-2 !text-lg" onClick={linkUebernehmen} disabled={!link.trim()}>
            Übernehmen
          </Knopf>
        </div>
      )}
      {fehler && (
        <p role="alert" className="text-lg font-semibold text-red-200">
          {fehler}
        </p>
      )}
    </div>
  )
}

function StartZeit({ wert, setze, nr }: { wert: number | undefined; setze: (s: number | undefined) => void; nr: number }) {
  const [text, setText] = useState(wert ? zeitText(wert) : '')
  const s = leseZeit(text)
  const ungueltig = s !== undefined && (Number.isNaN(s) || s > 36000)
  return (
    <input
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const neu = leseZeit(e.target.value)
        if (neu === undefined || (!Number.isNaN(neu) && neu <= 36000)) setze(neu || undefined)
      }}
      placeholder="0:00"
      inputMode="numeric"
      aria-label={`Folie ${nr} Startzeit`}
      aria-invalid={ungueltig}
      className={`${feld} !w-24 ${ungueltig ? 'ring-4 ring-red-400' : ''}`}
    />
  )
}
