// Folientypen von Klassenfunk. Das Format entspricht genau dem, was die Datenbank prüft (kf_folie_gueltig).

export type Inhalte = {
  auswahl: { optionen: string[]; mehrfach: boolean }
  wortwolke: { woerter: 1 | 2 | 3 }
  offen: { max_zeichen: number; mehrfach: boolean }
  skala: { aussagen: string[]; links: string; rechts: string }
  rangfolge: { elemente: string[] }
  punkte: { optionen: string[] }
  raster: { elemente: string[]; x: [string, string]; y: [string, string] }
  fragen: Record<string, never>
  info: { text: string }
}
export type FolienTyp = keyof Inhalte
export type Folie = { [T in FolienTyp]: { typ: T; text: string; inhalt: Inhalte[T] } }[FolienTyp]

type TypInfo = { name: string; symbol: string; beschreibung: string }
export const FOLIENTYPEN: Record<FolienTyp, TypInfo> = {
  wortwolke: { name: 'Wortwolke', symbol: '☁', beschreibung: 'Kurze Begriffe sammeln – häufige werden groß' },
  auswahl: { name: 'Umfrage', symbol: '📊', beschreibung: 'Antwortmöglichkeiten zum Abstimmen' },
  offen: { name: 'Offene Frage', symbol: '✎', beschreibung: 'Längere Antworten als Karten' },
  skala: { name: 'Skala', symbol: '🎚', beschreibung: 'Aussagen von 1 bis 5 bewerten' },
  rangfolge: { name: 'Rangfolge', symbol: '🥇', beschreibung: 'Begriffe nach Wichtigkeit ordnen' },
  punkte: { name: '100 Punkte', symbol: '💯', beschreibung: '100 Punkte auf Möglichkeiten verteilen' },
  raster: { name: '2×2-Raster', symbol: '▦', beschreibung: 'Begriffe auf zwei Achsen einordnen' },
  fragen: { name: 'Fragen der Klasse', symbol: '🙋', beschreibung: 'Schüler stellen Fragen, andere stimmen zu' },
  info: { name: 'Info-Folie', symbol: '▭', beschreibung: 'Text zeigen, ohne Abstimmung' },
}
export const TYP_REIHENFOLGE: FolienTyp[] = ['wortwolke', 'auswahl', 'offen', 'skala', 'rangfolge', 'punkte', 'raster', 'fragen', 'info']

export const GRENZEN = { text: 300, option: 120, element: 80, aussage: 120, rasterElement: 60, achse: 30, skalaEnde: 40, info: 1000 }

export function neuerInhalt<T extends FolienTyp>(typ: T): Inhalte[T] {
  const inhalte: Inhalte = {
    auswahl: { optionen: ['', '', ''], mehrfach: false },
    wortwolke: { woerter: 2 },
    offen: { max_zeichen: 140, mehrfach: false },
    skala: { aussagen: [''], links: 'stimme nicht zu', rechts: 'stimme voll zu' },
    rangfolge: { elemente: ['', '', ''] },
    punkte: { optionen: ['', '', ''] },
    raster: { elemente: [''], x: ['wenig Aufwand', 'viel Aufwand'], y: ['wenig Nutzen', 'viel Nutzen'] },
    fragen: {},
    info: { text: '' },
  }
  return inhalte[typ]
}
export const neueFolie = (typ: FolienTyp = 'wortwolke'): Folie => ({ typ, text: '', inhalt: neuerInhalt(typ) }) as Folie

/** Typ wechseln und dabei Text und passende Listen übernehmen */
export function wechsleTyp(f: Folie, typ: FolienTyp): Folie {
  if (f.typ === typ) return f
  const neu = neueFolie(typ)
  neu.text = f.text
  const liste = 'optionen' in f.inhalt ? f.inhalt.optionen : 'elemente' in f.inhalt ? f.inhalt.elemente : 'aussagen' in f.inhalt ? f.inhalt.aussagen : null
  if (liste?.some((x) => x.trim())) {
    if (neu.typ === 'auswahl' || neu.typ === 'punkte') neu.inhalt.optionen = [...liste]
    if (neu.typ === 'rangfolge' || neu.typ === 'raster') neu.inhalt.elemente = [...liste]
    if (neu.typ === 'skala') neu.inhalt.aussagen = [...liste]
  }
  return neu
}

const t = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Leere Einträge entfernen, Texte kürzen – so, wie die Datenbank es erwartet */
export function bereinigeFolie(f: Folie): Folie {
  const text = t(f.text)
  switch (f.typ) {
    case 'auswahl':
      return { typ: 'auswahl', text, inhalt: { optionen: f.inhalt.optionen.map(t).filter(Boolean), mehrfach: f.inhalt.mehrfach } }
    case 'punkte':
      return { typ: 'punkte', text, inhalt: { optionen: f.inhalt.optionen.map(t).filter(Boolean) } }
    case 'rangfolge':
      return { typ: 'rangfolge', text, inhalt: { elemente: f.inhalt.elemente.map(t).filter(Boolean) } }
    case 'skala':
      return { typ: 'skala', text, inhalt: { aussagen: f.inhalt.aussagen.map(t).filter(Boolean), links: t(f.inhalt.links), rechts: t(f.inhalt.rechts) } }
    case 'raster':
      return {
        typ: 'raster',
        text,
        inhalt: { elemente: f.inhalt.elemente.map(t).filter(Boolean), x: [t(f.inhalt.x[0]), t(f.inhalt.x[1])], y: [t(f.inhalt.y[0]), t(f.inhalt.y[1])] },
      }
    case 'info':
      return { typ: 'info', text, inhalt: { text: f.inhalt.text.trim() } }
    default:
      return { ...f, text } as Folie
  }
}

/** Probleme einer Präsentation (leer = alles in Ordnung) */
export function pruefePraesentation(titel: string, folien: Folie[]): string[] {
  const p: string[] = []
  if (!titel.trim()) p.push('Bitte gib der Präsentation einen Titel.')
  if (!folien.length) p.push('Lege mindestens eine Folie an.')
  folien.map(bereinigeFolie).forEach((f, i) => {
    const n = `Folie ${i + 1}`
    if (!f.text) p.push(`${n}: Bitte eine Frage bzw. Überschrift eintragen.`)
    if (f.text.length > GRENZEN.text) p.push(`${n}: Der Text ist zu lang (höchstens ${GRENZEN.text} Zeichen).`)
    const anzahl = (liste: string[], min: number, max: number, was: string) => {
      if (liste.length < min) p.push(`${n}: Mindestens ${min} ${was}.`)
      if (liste.length > max) p.push(`${n}: Höchstens ${max} ${was}.`)
    }
    switch (f.typ) {
      case 'auswahl':
      case 'punkte':
        anzahl(f.inhalt.optionen, 2, 8, 'Antwortmöglichkeiten')
        break
      case 'rangfolge':
        anzahl(f.inhalt.elemente, 2, 8, 'Begriffe')
        break
      case 'skala':
        anzahl(f.inhalt.aussagen, 1, 6, 'Aussagen')
        if (!f.inhalt.links || !f.inhalt.rechts) p.push(`${n}: Bitte beide Enden der Skala beschriften.`)
        break
      case 'raster':
        anzahl(f.inhalt.elemente, 1, 6, 'Begriffe')
        if (!f.inhalt.x.every(Boolean) || !f.inhalt.y.every(Boolean)) p.push(`${n}: Bitte alle vier Achsen beschriften.`)
        break
    }
  })
  return p
}
