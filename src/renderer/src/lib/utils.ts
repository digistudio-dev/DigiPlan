import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Couleur de texte lisible (noir/blanc) sur un fond donné. */
export function readableOn(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111' : '#fff'
}

/** Mélange une couleur avec du blanc/noir pour des fonds doux selon le thème. */
export function tint(hex: string, amount: number, dark: boolean): string {
  const h = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const base = dark ? [20, 22, 27] : [255, 255, 255]
  const mixed = c.map((v, i) => Math.round(base[i] + (v - base[i]) * amount))
  return `rgb(${mixed.join(',')})`
}

/** Majuscule sur la première lettre uniquement (« mardi 06 octobre » → « Mardi 06 octobre »). */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? plural : singular}`
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}
