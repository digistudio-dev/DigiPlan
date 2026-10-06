import { useEffect, useState } from 'react'
import type { ThemePreference } from '@shared/types'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Applique le thème (clair/sombre/système) à la racine du document. */
export function useApplyTheme(pref: ThemePreference | undefined): boolean {
  const [systemDark, setSystemDark] = useState(() => media().matches)
  useEffect(() => {
    const m = media()
    const listener = () => setSystemDark(m.matches)
    m.addEventListener('change', listener)
    return () => m.removeEventListener('change', listener)
  }, [])
  const dark = pref === 'dark' || ((pref ?? 'system') === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('digiplan.theme', dark ? 'dark' : 'light')
    } catch {
      // stockage indisponible : sans conséquence
    }
  }, [dark])
  return dark
}

/** Vrai si le thème sombre est actif (lecture directe du DOM). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}
