import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.tsx'
import Startseite from './pages/Startseite.tsx'
import Mitmachen from './pages/Mitmachen.tsx'
import Anmelden from './pages/lehrkraft/Anmelden.tsx'
import Passwort from './pages/lehrkraft/Passwort.tsx'
import Liste from './pages/lehrkraft/Liste.tsx'
import Editor from './pages/lehrkraft/Editor.tsx'
import Praesentieren from './pages/lehrkraft/Praesentieren.tsx'

/** Zeigt den Inhalt nur angemeldeten Lehrkräften, sonst die Anmeldung. */
export function NurAngemeldet({ children }: { children: ReactNode }) {
  const { session, laedt } = useAuth()
  if (laedt) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-2xl text-white/70">Einen Moment …</p>
      </main>
    )
  }
  return session ? <>{children}</> : <Anmelden />
}

const geschuetzt = (el: ReactNode) => <NurAngemeldet>{el}</NurAngemeldet>

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Startseite />} />
        <Route path="/mitmachen" element={<Mitmachen />} />
        <Route path="/leiten" element={geschuetzt(<Liste />)} />
        <Route path="/leiten/praesentation/:id" element={geschuetzt(<Editor />)} />
        <Route path="/leiten/sitzung/:id" element={geschuetzt(<Praesentieren />)} />
        <Route path="/passwort" element={<Passwort />} />
        <Route path="*" element={<Startseite />} />
      </Routes>
    </AuthProvider>
  )
}
