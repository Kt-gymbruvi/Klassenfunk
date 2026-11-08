// Bilder für Info-Folien hochladen und aufräumen.
// Dateien liegen im Supabase-Speicher (Bucket "klassenfunk-medien", siehe kf_002_medien.sql),
// jede Lehrkraft in ihrem eigenen Ordner: <nutzer-id>/<zufällige-id>.<endung>

import { db } from './supabase.ts'
import type { Medium } from './folien.ts'

export const BUCKET = 'klassenfunk-medien'
const MB = 1024 * 1024
const TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ENDUNG: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
/** Grenze vor dem Verkleinern (danach ist ein Bild meist weit unter 1 MB; der Speicher nimmt höchstens 10 MB) */
const MAX_ORIGINAL = 25 * MB
const MAX_SPEICHER = 10 * MB

/** Prüft eine Datei vor dem Hochladen. Liefert eine Fehlermeldung oder null. */
export function pruefeBild(datei: File): string | null {
  if (!TYPEN.includes(datei.type)) return 'Dieses Dateiformat geht leider nicht. Erlaubt: JPG, PNG, WebP oder GIF.'
  if (datei.size > MAX_ORIGINAL) return `Das Bild ist zu groß (höchstens ${MAX_ORIGINAL / MB} MB).`
  return null
}

/** Größte Kantenlänge – reicht für den Beamer und spart Speicher. */
const BILD_MAX_PX = 1920

/** Verkleinert ein Bild auf höchstens 1920 px und speichert es als WebP (GIFs bleiben, wegen Animation). */
async function verkleinere(datei: File): Promise<Blob> {
  if (datei.type === 'image/gif' || typeof createImageBitmap !== 'function') return datei
  try {
    const bild = await createImageBitmap(datei)
    const faktor = Math.min(1, BILD_MAX_PX / Math.max(bild.width, bild.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bild.width * faktor)
    canvas.height = Math.round(bild.height * faktor)
    canvas.getContext('2d')!.drawImage(bild, 0, 0, canvas.width, canvas.height)
    bild.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85))
    // Falls der Browser kein WebP kann oder das Ergebnis größer wäre: Original nehmen
    return blob && blob.type === 'image/webp' && blob.size < datei.size ? blob : datei
  } catch {
    return datei
  }
}

/** Zufällige UUID (v4) als Dateiname – crypto.getRandomValues geht auch ohne https (Test im WLAN). */
function zufallsId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function nutzerId(): Promise<string> {
  const { data } = await db().auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Bitte melde dich erneut an.')
  return id
}

/** Lädt ein Bild in den eigenen Ordner hoch und liefert das Medium für die Folie. */
export async function ladeBildHoch(datei: File): Promise<Medium> {
  const fehler = pruefeBild(datei)
  if (fehler) throw new Error(fehler)
  const inhalt = await verkleinere(datei)
  if (inhalt.size > MAX_SPEICHER) throw new Error('Das Bild ist zu groß (höchstens 10 MB).')
  const pfad = `${await nutzerId()}/${zufallsId()}.${ENDUNG[inhalt.type]}`
  const speicher = db().storage.from(BUCKET)
  const { error } = await speicher.upload(pfad, inhalt, { contentType: inhalt.type, cacheControl: '31536000', upsert: false })
  if (error) throw error
  return { art: 'bild', url: speicher.getPublicUrl(pfad).data.publicUrl, pfad }
}

/** Unbenutzte Dateien bleiben 24 Stunden liegen (z. B. noch in einem offenen Editor oder einer laufenden Sitzung). */
const FRIST_MS = 24 * 60 * 60 * 1000

/**
 * Löscht eigene Bilder, die in keiner eigenen Präsentation mehr vorkommen und älter als 24 Stunden sind.
 * Fehler werden ignoriert – Aufräumen darf Speichern oder Löschen nie verhindern.
 */
export async function raeumeBilderAuf(): Promise<string[]> {
  try {
    const uid = await nutzerId()
    const speicher = db().storage.from(BUCKET)
    const { data: dateien, error } = await speicher.list(uid, { limit: 1000 })
    if (error || !dateien?.length) return []
    const { data: folien, error: fehler } = await db().from('kf_folien').select('inhalt').eq('typ', 'info')
    if (fehler) return []
    const benutzt = new Set((folien ?? []).map((f) => (f.inhalt as { medium?: { pfad?: string } } | null)?.medium?.pfad).filter(Boolean))
    const jetzt = Date.now()
    const weg = dateien
      .filter((d) => jetzt - new Date(d.created_at ?? jetzt).getTime() > FRIST_MS)
      .map((d) => `${uid}/${d.name}`)
      .filter((pfad) => !benutzt.has(pfad))
    if (weg.length) await speicher.remove(weg)
    return weg
  } catch {
    return []
  }
}
