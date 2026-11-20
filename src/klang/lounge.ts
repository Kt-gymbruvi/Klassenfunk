import type { Note, Stueck } from './motor.ts'
import { akkord, linie, m, muster } from './noten.ts'

// Klassenfunk-Klang: entspannte Lounge – weiches E-Piano, lockerer Swing, leise Besen am Becken –
// aber mit dem hüpfenden Grundgefühl der Quiz-Shows. Eigene Komposition, bewusst leise im Hintergrund.

// ── Schleife: 8 Takte (Dmaj9 – Bm9 – Em9 – A13 – Dmaj9 – Gmaj9 – Em9 – A13), 92 bpm, geswingt ──
const AKKORDE: { wurzel: string; toene: string[] }[] = [
  { wurzel: 'D2', toene: ['C#4', 'E4', 'F#4'] }, // Dmaj9
  { wurzel: 'B1', toene: ['C#4', 'D4', 'A4'] }, // Bm9
  { wurzel: 'E2', toene: ['D4', 'F#4', 'G4'] }, // Em9
  { wurzel: 'A1', toene: ['C#4', 'F#4', 'G4'] }, // A13
  { wurzel: 'D2', toene: ['C#4', 'E4', 'F#4'] }, // Dmaj9
  { wurzel: 'G2', toene: ['B3', 'F#4', 'A4'] }, // Gmaj9
  { wurzel: 'E2', toene: ['D4', 'F#4', 'G4'] }, // Em9
  { wurzel: 'A1', toene: ['C#4', 'F#4', 'G4'] }, // A13
]

const takt = (a: { wurzel: string; toene: string[] }, i: number): Note[] => {
  const b = i * 4
  const w = m(a.wurzel)
  return [
    // E-Piano: lange Betonung auf 1, locker nachgelegt auf „und“ von 2 und 3
    ...akkord('rhodes', b, a.toene, 1.4, 0.9),
    ...akkord('rhodes', b + 1.5, a.toene, 0.5, 0.6),
    ...akkord('rhodes', b + 2.5, a.toene, 0.5, 0.7),
    // weicher Bass
    { t: b, stimme: 'bass', ton: w, dauer: 1, laut: 0.9 },
    { t: b + 1.5, stimme: 'bass', ton: w, dauer: 0.5, laut: 0.6 },
    { t: b + 2, stimme: 'bass', ton: w + 7, dauer: 1, laut: 0.7 },
    { t: b + 3.5, stimme: 'bass', ton: w + 12, dauer: 0.5, laut: 0.55 },
  ]
}

export const LOUNGE: Stueck = {
  bpm: 92,
  beats: 32,
  swing: 0.17,
  laut: 0.42,
  noten: [
    ...AKKORDE.flatMap(takt),
    // kleine Läufe am Ende von Takt 2, 4, 6 und 8
    ...linie('glocke', [[6, 'D5'], [6.5, 'F#5'], [7, 'E5', 1]], 0.45),
    ...linie('glocke', [[14, 'E5'], [14.5, 'F#5'], [15, 'A5', 1]], 0.5),
    ...linie('glocke', [[22, 'B4'], [22.5, 'D5'], [23, 'A5', 1]], 0.45),
    ...linie('glocke', [[30, 'E5'], [30.5, 'F#5'], [31, 'A5', 1]], 0.5),
    // Besen und leiser Puls
    ...muster('hat', 'x'.repeat(64), 0.5, 0.38),
    ...muster('holz', '.x.x'.repeat(8), 1, 0.4),
    ...muster('kick', 'x.x.'.repeat(8), 1, 0.45),
  ],
}

// ── Effekte (leise und weich) ──
const PENTATONIK = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6']

/** Eine neue Antwort ist eingetroffen: ein sanftes Glöckchen, reihum in der Pentatonik */
export const neueAntwort = (i: number): Stueck => ({ bpm: 100, laut: 0.5, noten: linie('glocke', [[0, PENTATONIK[i % PENTATONIK.length], 1]], 0.7) })

/** Abstimmung geht auf: warmes Arpeggio nach oben */
export const ABSTIMMUNG_AUF: Stueck = { bpm: 110, laut: 0.55, noten: linie('rhodes', [[0, 'D4', 1], [0.5, 'F#4', 1], [1, 'A4', 1], [1.5, 'C#5', 2]], 0.9) }

/** Abstimmung schließt: Arpeggio nach unten */
export const ABSTIMMUNG_ZU: Stueck = { bpm: 110, laut: 0.55, noten: linie('rhodes', [[0, 'C#5', 1], [0.5, 'A4', 1], [1, 'F#4', 1], [1.5, 'D4', 2]], 0.9) }

/** Neue Folie: zwei weiche Töne */
export const FOLIE: Stueck = { bpm: 110, laut: 0.45, noten: linie('glocke', [[0, 'A4', 1], [0.5, 'D5', 1.5]], 0.7) }
