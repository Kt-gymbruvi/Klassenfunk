import type { ReactNode } from 'react'
import type { Antwort, KlassenFrage } from '../lib/daten.ts'
import type { Folie } from '../lib/folien.ts'

// Live-Ergebnisse am Beamer – je Folientyp. Ausgeblendete Antworten zählen nicht.

const FARBEN = ['bg-funk-koralle', 'bg-sky-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-400', 'bg-rose-500', 'bg-teal-400', 'bg-orange-500']
const TEXTFARBEN = ['text-funk-koralle', 'text-sky-300', 'text-emerald-300', 'text-violet-300', 'text-amber-300', 'text-rose-300', 'text-teal-300', 'text-white']
const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** Wörter zusammenfassen (ohne Groß-/Kleinschreibung), häufigste zuerst – mit den Antwort-IDs zum Ausblenden */
export function gruppiereWoerter(antworten: Antwort[]) {
  const g = new Map<string, { text: string; anzahl: number; ids: number[] }>()
  for (const a of antworten) {
    const text = String(a.antwort ?? '').trim()
    const k = text.toLocaleLowerCase('de').replace(/\s+/g, ' ')
    if (!k) continue
    const e = g.get(k)
    if (e) {
      e.anzahl++
      e.ids.push(a.id)
    } else g.set(k, { text, anzahl: 1, ids: [a.id] })
  }
  return [...g.values()].sort((a, b) => b.anzahl - a.anzahl || a.text.localeCompare(b.text, 'de'))
}

function Balken({ i, text, wert, max, anzeige }: { i: number; text: ReactNode; wert: number; max: number; anzeige: string }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-3xl font-bold">
        <span className="break-words">{text}</span>
        <span className="shrink-0 tabular-nums">{anzeige}</span>
      </div>
      <div className="h-6 rounded-full bg-white/10">
        <div className={`h-6 rounded-full transition-[width] duration-500 ${FARBEN[i % FARBEN.length]}`} style={{ width: `${max ? (wert / max) * 100 : 0}%` }} />
      </div>
    </li>
  )
}

function Leer({ children }: { children: ReactNode }) {
  return <p className="flex flex-1 items-center justify-center text-center text-4xl font-bold text-white/60">{children}</p>
}

export function Ergebnis({
  folie,
  antworten,
  fragen,
  ausblenden,
  frageMarkieren,
}: {
  folie: Folie
  antworten: Antwort[]
  fragen: KlassenFrage[]
  ausblenden: (ids: number[]) => void
  frageMarkieren: (f: KlassenFrage, versteckt: boolean, beantwortet: boolean) => void
}) {
  const sichtbar = antworten.filter((a) => !a.versteckt)
  switch (folie.typ) {
    case 'auswahl': {
      const n = folie.inhalt.optionen.map((_, i) => sichtbar.filter((a) => Array.isArray(a.antwort) && a.antwort.includes(i)).length)
      const personen = sichtbar.length
      return (
        <ul className="flex flex-col gap-5">
          {folie.inhalt.optionen.map((o, i) => (
            <Balken key={i} i={i} text={o} wert={n[i]} max={Math.max(1, ...n)} anzeige={`${n[i]} · ${personen ? Math.round((n[i] / personen) * 100) : 0} %`} />
          ))}
        </ul>
      )
    }
    case 'wortwolke': {
      const g = gruppiereWoerter(sichtbar)
      if (!g.length) return <Leer>☁ Die Wörter erscheinen hier, sobald sie eintreffen.</Leer>
      const max = g[0].anzahl
      return (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 rounded-3xl bg-white/5 px-8 py-8" aria-label="Wortwolke">
            {g.slice(0, 60).map((w, i) => (
              <li key={w.text}>
                <button
                  type="button"
                  onClick={() => ausblenden(w.ids)}
                  title="Antippen zum Ausblenden"
                  className={`font-black leading-none transition hover:line-through ${TEXTFARBEN[i % TEXTFARBEN.length]}`}
                  style={{ fontSize: `${1.4 + (w.anzahl / max) * 3.8}rem` }}
                >
                  {w.text}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-center text-lg text-white/50">Antippen blendet ein Wort aus.</p>
        </div>
      )
    }
    case 'offen':
      if (!sichtbar.length) return <Leer>✎ Die Antworten erscheinen hier.</Leer>
      return (
        <div className="flex flex-col gap-3">
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sichtbar.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => ausblenden([a.id])} title="Antippen zum Ausblenden" className="h-full w-full rounded-2xl bg-white px-5 py-4 text-left text-2xl text-funk-petrol-dark hover:opacity-60">
                  {String(a.antwort)}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-center text-lg text-white/50">Antippen blendet eine Antwort aus.</p>
        </div>
      )
    case 'skala': {
      const werte = sichtbar.map((a) => a.antwort as number[]).filter(Array.isArray)
      return (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between px-1 text-xl text-white/70">
            <span>1 = {folie.inhalt.links}</span>
            <span>5 = {folie.inhalt.rechts}</span>
          </div>
          <ul className="flex flex-col gap-6">
            {folie.inhalt.aussagen.map((s, i) => {
              const v = werte.map((w) => w[i]).filter((x) => typeof x === 'number')
              const schnitt = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
              const verteilung = [1, 2, 3, 4, 5].map((k) => v.filter((x) => x === k).length)
              return (
                <li key={i} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-4 text-3xl font-bold">
                    <span>{s}</span>
                    <span className="shrink-0 tabular-nums text-funk-koralle">{schnitt === null ? '–' : zahl.format(schnitt)}</span>
                  </div>
                  <div className="relative h-6 rounded-full bg-gradient-to-r from-rose-500/50 via-amber-400/50 to-emerald-500/50">
                    {schnitt !== null && (
                      <span className="absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-funk-koralle transition-[left] duration-500" style={{ left: `${((schnitt - 1) / 4) * 100}%` }} />
                    )}
                  </div>
                  <div className="grid grid-cols-5 text-center text-base text-white/60 tabular-nums">
                    {verteilung.map((n, k) => (
                      <span key={k}>
                        {k + 1}: {n}
                      </span>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )
    }
    case 'rangfolge': {
      const n = folie.inhalt.elemente.length
      const reihen = sichtbar.map((a) => a.antwort as number[]).filter(Array.isArray)
      // Durchschnittsplatz je Begriff (1 = wichtigster)
      const plaetze = folie.inhalt.elemente.map((e, i) => {
        const p = reihen.map((r) => r.indexOf(i) + 1).filter((x) => x > 0)
        return { e, i, schnitt: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null }
      })
      plaetze.sort((a, b) => (a.schnitt ?? 99) - (b.schnitt ?? 99))
      if (!reihen.length) return <Leer>🥇 Die gemeinsame Rangfolge erscheint hier.</Leer>
      return (
        <ol className="flex flex-col gap-4">
          {plaetze.map((p, k) => (
            <li key={p.i} className="flex items-center gap-5">
              <span className="w-14 text-right text-5xl font-black text-funk-koralle">{k + 1}.</span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-4 text-3xl font-bold">
                  <span>{p.e}</span>
                  <span className="text-xl font-semibold text-white/60">Ø Platz {p.schnitt === null ? '–' : zahl.format(p.schnitt)}</span>
                </div>
                <div className="mt-1 h-4 rounded-full bg-white/10">
                  <div className={`h-4 rounded-full ${FARBEN[p.i % FARBEN.length]}`} style={{ width: `${p.schnitt === null ? 0 : ((n - p.schnitt + 1) / n) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )
    }
    case 'punkte': {
      const verteilungen = sichtbar.map((a) => a.antwort as number[]).filter(Array.isArray)
      const schnitt = folie.inhalt.optionen.map((_, i) => (verteilungen.length ? verteilungen.reduce((s, v) => s + (v[i] ?? 0), 0) / verteilungen.length : 0))
      return (
        <ul className="flex flex-col gap-5">
          {folie.inhalt.optionen.map((o, i) => (
            <Balken key={i} i={i} text={o} wert={schnitt[i]} max={Math.max(1, ...schnitt)} anzeige={`Ø ${zahl.format(schnitt[i])} Punkte`} />
          ))}
        </ul>
      )
    }
    case 'raster': {
      const punkte = sichtbar.map((a) => a.antwort as [number, number][]).filter(Array.isArray)
      const mittel = folie.inhalt.elemente.map((_, i) => {
        const p = punkte.map((x) => x[i]).filter(Boolean)
        return p.length ? [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length] : null
      })
      const pos = (x: number, y: number) => ({ left: `${x * 10}%`, top: `${100 - y * 10}%` })
      return (
        <div className="flex flex-1 items-stretch gap-6">
          <div className="flex flex-col justify-between py-2 text-right text-xl text-white/70">
            <span>{folie.inhalt.y[1]} ↑</span>
            <span>{folie.inhalt.y[0]}</span>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div className="relative min-h-72 w-full flex-1 rounded-3xl bg-white/5 ring-2 ring-white/20" aria-label="2×2-Raster">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
              {punkte.flatMap((p, k) =>
                p.map((q, i) => <span key={`${k}-${i}`} className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 ${FARBEN[i % FARBEN.length]}`} style={pos(q[0], q[1])} />),
              )}
              {mittel.map((m, i) =>
                m ? (
                  <span key={i} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 transition-all duration-500" style={pos(m[0], m[1])}>
                    <span className={`h-8 w-8 rounded-full border-4 border-white ${FARBEN[i % FARBEN.length]}`} />
                    <span className="rounded-xl bg-funk-petrol-dark/80 px-2 py-0.5 text-2xl font-extrabold whitespace-nowrap">{folie.inhalt.elemente[i]}</span>
                  </span>
                ) : null,
              )}
            </div>
            <div className="flex justify-between text-xl text-white/70">
              <span>{folie.inhalt.x[0]}</span>
              <span>{folie.inhalt.x[1]} →</span>
            </div>
          </div>
        </div>
      )
    }
    case 'fragen': {
      const liste = fragen.filter((f) => !f.versteckt).sort((a, b) => Number(a.beantwortet) - Number(b.beantwortet) || b.stimmen - a.stimmen || a.id - b.id)
      if (!liste.length) return <Leer>🙋 Noch keine Fragen. Schickt sie über euer Handy!</Leer>
      return (
        <ul className="flex flex-col gap-3">
          {liste.map((f) => (
            <li key={f.id} className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${f.beantwortet ? 'bg-white/5 text-white/50' : 'bg-white text-funk-petrol-dark'}`}>
              <span className="flex min-w-16 flex-col items-center text-2xl font-black tabular-nums" aria-label={`${f.stimmen} Stimmen`}>
                👍 {f.stimmen}
              </span>
              <span className={`flex-1 text-2xl font-bold ${f.beantwortet ? 'line-through' : ''}`}>{f.text}</span>
              <button type="button" onClick={() => frageMarkieren(f, false, !f.beantwortet)} className="rounded-xl bg-emerald-600 px-3 py-2 text-lg font-bold text-white">
                {f.beantwortet ? '↺' : '✓ beantwortet'}
              </button>
              <button type="button" onClick={() => frageMarkieren(f, true, f.beantwortet)} className="rounded-xl bg-black/20 px-3 py-2 text-lg font-bold" aria-label={`Frage ausblenden: ${f.text}`}>
                ausblenden
              </button>
            </li>
          ))}
        </ul>
      )
    }
    case 'info': {
      const { text, medium } = folie.inhalt
      if (!medium) return text ? <p className="flex-1 rounded-3xl bg-white/5 px-10 py-8 text-4xl leading-snug whitespace-pre-line">{text}</p> : <div className="flex-1" />
      return (
        <div className="flex flex-1 gap-6">
          {text && <p className="max-w-[40%] shrink-0 self-start rounded-3xl bg-white/5 px-8 py-6 text-3xl leading-snug whitespace-pre-line">{text}</p>}
          {/* Das Medium füllt den restlichen Platz, ohne die Höhe zu bestimmen (sonst würde alles verkleinert) */}
          <div className="relative min-h-[45vh] flex-1">
            {medium.art === 'bild' ? (
              <img src={medium.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <iframe
                // youtube-nocookie: YouTube setzt erst beim Abspielen Cookies (nur auf dem Lehrkraft-Gerät)
                src={`https://www.youtube-nocookie.com/embed/${medium.id}?${new URLSearchParams({ rel: '0', playsinline: '1', ...(medium.start ? { start: String(medium.start) } : {}) })}`}
                title="YouTube-Video"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 h-full w-full rounded-3xl bg-black"
              />
            )}
          </div>
        </div>
      )
    }
  }
}
