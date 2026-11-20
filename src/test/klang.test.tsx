import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TonSchalter } from '../klang/hooks.tsx'
import * as lounge from '../klang/lounge.ts'
import { setzeTon, spieleEffekt, starteSchleife, tonAn, type Stueck } from '../klang/motor.ts'
import { m } from '../klang/noten.ts'
import { BREITE, HOEHE, legeWolkeAus } from '../wortwolke.tsx'

const MELODISCH = new Set(['pluck', 'lead', 'bass', 'rhodes', 'glocke', 'streicher', 'blech', 'buzz'])

describe('Klänge', () => {
  it('Notennamen werden richtig übersetzt', () => {
    expect(m('A4')).toBe(69)
    expect(m('F#3')).toBe(54)
    expect(m('Eb3')).toBe(51)
  })

  it('Lounge-Schleife: Noten liegen im Stück und haben Tonhöhen', () => {
    const s = lounge.LOUNGE
    expect(s.beats).toBe(32)
    for (const n of s.noten) {
      expect(n.t).toBeGreaterThanOrEqual(0)
      expect(n.t).toBeLessThan(s.beats!)
      if (MELODISCH.has(n.stimme)) expect(Number.isFinite(n.ton)).toBe(true)
    }
  })

  it('Effekte sind kurze Stücke ohne Schleife', () => {
    const effekte: Stueck[] = [lounge.ABSTIMMUNG_AUF, lounge.ABSTIMMUNG_ZU, lounge.FOLIE, lounge.neueAntwort(0), lounge.neueAntwort(7)]
    for (const s of effekte) {
      expect(s.beats).toBeUndefined()
      expect(s.noten.length).toBeGreaterThan(0)
    }
  })

  it('ohne Web Audio passiert einfach nichts (Tests, alte Browser)', () => {
    expect(() => spieleEffekt(lounge.FOLIE)).not.toThrow()
    expect(() => starteSchleife(lounge.LOUNGE)()).not.toThrow()
  })

  it('Ton-Schalter schaltet um und merkt sich die Wahl', async () => {
    localStorage.removeItem('ton-an')
    setzeTon(true)
    render(<TonSchalter />)
    await userEvent.click(screen.getByRole('button', { name: 'Ton ausschalten' }))
    expect(tonAn()).toBe(false)
    expect(localStorage.getItem('ton-an')).toBe('0')
    await userEvent.click(screen.getByRole('button', { name: 'Ton einschalten' }))
    expect(tonAn()).toBe(true)
  })
})

describe('Wortwolke: Anordnung', () => {
  const woerter = ['Erbgut', 'Gen', 'Zelle', 'Helix', 'Chromosom', 'Vererbung', 'Basen', 'Protein'].map((text, i) => ({ schluessel: text, text, anzahl: 8 - i }))

  it('alle Wörter haben Platz im Bild und nichts überlappt', () => {
    const l = legeWolkeAus('Was fällt dir zu DNA ein?', woerter)
    expect(l.woerter).toHaveLength(woerter.length)
    const kasten = l.woerter.map((w) => ({ x: w.x, y: w.y, b: w.text.length * w.schrift * 0.58 + 1.2, h: w.schrift * 1.2 + 0.6 }))
    for (const k of kasten) {
      expect(k.x - k.b / 2).toBeGreaterThanOrEqual(1)
      expect(k.x + k.b / 2).toBeLessThanOrEqual(BREITE - 1)
      expect(k.y - k.h / 2).toBeGreaterThanOrEqual(1)
      expect(k.y + k.h / 2).toBeLessThanOrEqual(HOEHE - 1)
    }
    const ueber = (a: (typeof kasten)[number], b: (typeof kasten)[number]) => Math.abs(a.x - b.x) < (a.b + b.b) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2
    kasten.forEach((a, i) => kasten.slice(i + 1).forEach((b) => expect(ueber(a, b)).toBe(false)))
  })
})
