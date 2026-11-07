/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Basis-Pfad für GitHub Pages: https://kt-gymbruvi.github.io/Klassenfunk/
export default defineConfig({
  base: '/Klassenfunk/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
