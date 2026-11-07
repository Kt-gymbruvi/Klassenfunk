import { Link } from 'react-router-dom'
import { Logo } from '../components.tsx'

export default function Startseite() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-12 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo gross />
        <p className="text-2xl text-white/80">Abstimmen, Wortwolken, Fragen – live im Unterricht</p>
      </div>
      <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
        <Link
          to="/mitmachen"
          className="flex-1 rounded-3xl bg-funk-koralle px-8 py-6 text-3xl font-extrabold text-funk-petrol-dark shadow-[0_6px_0_var(--color-funk-koralle-dark)] transition active:translate-y-1 active:shadow-none"
        >
          Mitmachen
        </Link>
        <Link to="/leiten" className="flex-1 rounded-3xl border-3 border-funk-koralle px-8 py-6 text-3xl font-extrabold text-funk-koralle hover:bg-funk-koralle hover:text-funk-petrol-dark">
          Präsentieren
        </Link>
      </div>
      <p className="max-w-lg text-base text-white/60">Mitmachen ohne Konto und ohne Namen – nur mit der PIN vom Beamer.</p>
    </main>
  )
}
