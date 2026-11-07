// Zugriff auf die Datenbank: Präsentationen (Lehrkraft) und Live-Sitzungen (Lehrkraft und Schüler)
import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { bereinigeFolie, type Folie } from './folien.ts'
import { db, supabase } from './supabase.ts'

async function aufruf<T>(funktion: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(funktion, args)
  if (error) throw error
  return data as T
}

// ---------- Präsentationen ----------
export type PraesentationKurz = { id: string; titel: string; geaendert_am: string; anzahlFolien: number }

export async function ladePraesentationen(): Promise<PraesentationKurz[]> {
  const { data, error } = await db().from('kf_praesentationen').select('id, titel, geaendert_am, kf_folien(count)').order('geaendert_am', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as { id: string; titel: string; geaendert_am: string; kf_folien: { count: number }[] | null }[]).map((p) => ({
    id: p.id,
    titel: p.titel,
    geaendert_am: p.geaendert_am,
    anzahlFolien: p.kf_folien?.[0]?.count ?? 0,
  }))
}

export async function ladePraesentation(id: string): Promise<{ titel: string; folien: Folie[] }> {
  const { data, error } = await db()
    .from('kf_praesentationen')
    .select('titel, kf_folien(position, typ, text, inhalt)')
    .eq('id', id)
    .order('position', { referencedTable: 'kf_folien' })
    .single()
  if (error) throw error
  const p = data as unknown as { titel: string; kf_folien: (Folie & { position: number })[] }
  return { titel: p.titel, folien: p.kf_folien.map(({ typ, text, inhalt }) => ({ typ, text, inhalt }) as Folie) }
}

export const speicherePraesentation = (id: string | null, titel: string, folien: Folie[]) =>
  aufruf<string>('kf_praesentation_speichern', { p_id: id, p_titel: titel.trim(), p_folien: folien.map(bereinigeFolie) })

export async function loeschePraesentation(id: string) {
  const { error } = await db().from('kf_praesentationen').delete().eq('id', id)
  if (error) throw error
}

// ---------- Live-Sitzung: Lehrkraft ----------
export type Antwort = { id: number; antwort: unknown; versteckt: boolean }
export type KlassenFrage = { id: number; text: string; versteckt: boolean; beantwortet: boolean; stimmen: number }
export type Ergebnisse = {
  id: string
  pin: string
  titel: string
  folie_nr: number
  anzahl_folien: number
  folie: Folie
  abstimmung_offen: boolean
  ergebnisse_sichtbar: boolean
  teilnehmer: number
  abgestimmt: number
  antworten: Antwort[]
  fragen: KlassenFrage[]
}

export const starteSitzung = (praesentationId: string) => aufruf<{ id: string; pin: string }>('kf_sitzung_starten', { p_praesentation: praesentationId })
export const steuereSitzung = (id: string, folieNr: number, offen: boolean, sichtbar: boolean) =>
  aufruf<void>('kf_sitzung_steuern', { p_sitzung: id, p_folie_nr: folieNr, p_offen: offen, p_sichtbar: sichtbar })
export const ladeErgebnisse = (id: string) => aufruf<Ergebnisse | null>('kf_ergebnisse', { p_sitzung: id })
export const blendeAntwortAus = (antwortId: number, versteckt: boolean) => aufruf<void>('kf_antwort_ausblenden', { p_antwort: antwortId, p_versteckt: versteckt })
export const markiereFrage = (frageId: number, versteckt: boolean, beantwortet: boolean) =>
  aufruf<void>('kf_frage_markieren', { p_frage: frageId, p_versteckt: versteckt, p_beantwortet: beantwortet })
export async function beendeSitzung(id: string) {
  const { error } = await db().from('kf_sitzungen').delete().eq('id', id)
  if (error) throw error
}

export function mitmachLink(pin: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/mitmachen?pin=${pin}`
}

// ---------- Live-Sitzung: Schüler (anonym) ----------
export type Teilnahme = { sitzung_id: string; teilnehmer_id: string; token: string; pin?: string }
export type Zustand = {
  titel: string
  folie_nr: number
  anzahl_folien: number
  folie: Folie
  abstimmung_offen: boolean
  meine: unknown[]
  fragen: { id: number; text: string; beantwortet: boolean; stimmen: number; meine_stimme: boolean; von_mir: boolean }[] | null
}

export const trittBei = (pin: string) => aufruf<Teilnahme>('kf_beitreten', { p_pin: pin })
export const ladeZustand = (t: Teilnahme) => aufruf<Zustand | null>('kf_zustand', { p_teilnehmer: t.teilnehmer_id, p_token: t.token })
export const sendeAntwort = (t: Teilnahme, folieNr: number, antwort: unknown) =>
  aufruf<{ ok: boolean }>('kf_antworten', { p_teilnehmer: t.teilnehmer_id, p_token: t.token, p_folie_nr: folieNr, p_antwort: antwort })
export const stelleFrage = (t: Teilnahme, text: string) => aufruf<{ ok: boolean }>('kf_frage_stellen', { p_teilnehmer: t.teilnehmer_id, p_token: t.token, p_text: text })
export const stimmeFuerFrage = (t: Teilnahme, frageId: number) =>
  aufruf<{ gestimmt: boolean }>('kf_frage_stimmen', { p_teilnehmer: t.teilnehmer_id, p_token: t.token, p_frage: frageId })

// Teilnahme auf diesem Gerät merken (Neuladen, Zurück), höchstens 6 Stunden – nur Kennung und Token, kein Name
const SPEICHER = 'klassenfunk-teilnahme'
export function merkeTeilnahme(t: Teilnahme | null) {
  try {
    if (t) localStorage.setItem(SPEICHER, JSON.stringify({ ...t, gemerkt: Date.now() }))
    else localStorage.removeItem(SPEICHER)
  } catch {
    /* egal */
  }
}
export function gemerkteTeilnahme(): Teilnahme | null {
  try {
    const t = JSON.parse(localStorage.getItem(SPEICHER) ?? 'null')
    if (!t || Date.now() - (t.gemerkt ?? 0) > 6 * 3600_000) return null
    return t
  } catch {
    return null
  }
}

// ---------- Echtzeit ----------
/** Ruft `fn` regelmäßig auf (solange `aktiv`) */
export function useRegelmaessig(fn: () => void, ms: number, aktiv = true) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!aktiv) return
    ref.current()
    const t = setInterval(() => ref.current(), ms)
    return () => clearInterval(t)
  }, [ms, aktiv])
}

export type Reaktion = { emoji: string }
export type Barometer = { teilnehmer: string; tempo: -1 | 0 | 1 | null; verstanden: 0 | 1 | 2 | null }
export const REAKTIONEN = ['👍', '❤️', '😮', '😂', '🤔', '👏'] as const

/**
 * Kanal einer Sitzung: „aktualisieren“ (Daten neu laden), „reaktion“ (Emoji) und „barometer“ (Tempo/Verstanden).
 * Reaktionen und Barometer werden nirgends gespeichert.
 */
export function useSitzungsKanal(
  sitzungId: string | undefined,
  handler: { aktualisieren?: () => void; reaktion?: (r: Reaktion) => void; barometer?: (b: Barometer) => void },
) {
  const kanalRef = useRef<RealtimeChannel | null>(null)
  const h = useRef(handler)
  useEffect(() => {
    h.current = handler
  })
  useEffect(() => {
    if (!sitzungId || !supabase?.channel) return
    const kanal = supabase.channel(`klassenfunk-${sitzungId}`, { config: { broadcast: { self: false } } })
    kanal
      .on('broadcast', { event: 'aktualisieren' }, () => h.current.aktualisieren?.())
      .on('broadcast', { event: 'reaktion' }, ({ payload }) => h.current.reaktion?.(payload as Reaktion))
      .on('broadcast', { event: 'barometer' }, ({ payload }) => h.current.barometer?.(payload as Barometer))
      .subscribe()
    kanalRef.current = kanal
    return () => {
      kanalRef.current = null
      supabase?.removeChannel(kanal)
    }
  }, [sitzungId])
  return useCallback((event: 'aktualisieren' | 'reaktion' | 'barometer', payload: object = {}) => {
    kanalRef.current?.send({ type: 'broadcast', event, payload })
  }, [])
}
