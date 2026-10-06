import { fr, type Dictionary } from './fr'

// Langues disponibles. Arabe et anglais pourront être ajoutés ici.
const dictionaries: Record<string, Dictionary> = { fr }

let current: Dictionary = dictionaries.fr

export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? dictionaries.fr
}

/** Dictionnaire de la langue courante. */
export function useT(): Dictionary {
  return current
}

export const t = new Proxy({} as Dictionary, {
  get: (_target, key: string) => current[key as keyof Dictionary]
})
